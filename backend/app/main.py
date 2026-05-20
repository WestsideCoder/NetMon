# SPDX-License-Identifier: GPL-3.0-or-later
"""
Main FastAPI application.
"""
import asyncio
import json
import logging
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.config import settings
from app.database import async_engine, AsyncSessionLocal
from app.models import Base

from app.api import auth, users, devices, sites, snmp, alerts, scanner, settings as settings_api, map_images, ssl

logger = logging.getLogger(__name__)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                pass

ws_manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s v%s (%s)", settings.APP_NAME, settings.VERSION, settings.ENVIRONMENT)

    # Refuse to start in production with default secret key
    if settings.ENVIRONMENT == "production" and settings.SECRET_KEY == "dev-secret-key-change-in-production":
        raise RuntimeError(
            "FATAL: SECRET_KEY is set to the default value. "
            "Set a secure random SECRET_KEY before running in production."
        )

    # Create tables in development
    if settings.ENVIRONMENT == "development":
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables created")

    # Setup TimescaleDB hypertables
    if settings.TIMESCALEDB_ENABLED:
        try:
            from app.core.timescaledb import setup_timescaledb
            async with AsyncSessionLocal() as session:
                await setup_timescaledb(session)
        except Exception:
            logger.warning("TimescaleDB setup skipped (extension may not be available)")

    # Seed SNMP templates from YAML files
    try:
        from app.services.template_loader import seed_templates_to_db
        from app.database import SyncSessionLocal
        sync_db = SyncSessionLocal()
        try:
            count = seed_templates_to_db(sync_db)
            logger.info("Seeded %d SNMP templates to database", count)
        finally:
            sync_db.close()
    except Exception:
        logger.warning("Could not seed SNMP templates")

    # Seed default alert rules (idempotent — inserts any missing by name)
    try:
        from sqlalchemy import select, func
        from app.models.alert import AlertRule, AlertSeverity
        sync_db = SyncSessionLocal()
        try:
            default_rules = [
                # UPS rules
                dict(name="UPS On Battery (APC)", metric_name="upsBasicOutputStatus",
                     condition="eq", threshold=3.0, severity=AlertSeverity.WARNING,
                     device_type="ups", description="APC UPS running on battery power"),
                dict(name="UPS On Battery (Generic)", metric_name="upsOutputSource",
                     condition="eq", threshold=5.0, severity=AlertSeverity.WARNING,
                     device_type="ups", description="UPS running on battery power (RFC 1628)"),
                dict(name="UPS Battery Low (APC)", metric_name="upsBasicBatteryStatus",
                     condition="gte", threshold=3.0, severity=AlertSeverity.CRITICAL,
                     device_type="ups", description="APC UPS battery low or depleted"),
                dict(name="UPS Battery Low (Generic)", metric_name="upsBatteryStatus",
                     condition="gte", threshold=3.0, severity=AlertSeverity.CRITICAL,
                     device_type="ups", description="UPS battery low or depleted (RFC 1628)"),
                dict(name="UPS Battery Capacity Low", metric_name="upsAdvBatteryCapacity",
                     condition="lt", threshold=50.0, severity=AlertSeverity.WARNING,
                     device_type="ups", description="UPS battery capacity below 50%"),
                dict(name="UPS Battery Capacity Critical", metric_name="upsAdvBatteryCapacity",
                     condition="lt", threshold=20.0, severity=AlertSeverity.CRITICAL,
                     device_type="ups", description="UPS battery capacity below 20%"),
                # Generic device rules (all types)
                dict(name="Device Unreachable", metric_name="consecutive_failures",
                     condition="gte", threshold=3.0, severity=AlertSeverity.CRITICAL,
                     description="Device failed 3+ consecutive pings"),
                dict(name="High Response Time", metric_name="response_time",
                     condition="gt", threshold=500.0, severity=AlertSeverity.WARNING,
                     description="Device response time above 500ms"),
                # Server/host metrics (HOST-RESOURCES-MIB)
                dict(name="High Memory Usage", metric_name="memoryUsedPercent",
                     condition="gte", threshold=85.0, severity=AlertSeverity.WARNING,
                     description="Memory usage above 85%"),
                dict(name="Critical Memory Usage", metric_name="memoryUsedPercent",
                     condition="gte", threshold=95.0, severity=AlertSeverity.CRITICAL,
                     description="Memory usage above 95%"),
                dict(name="High CPU Usage", metric_name="cpuLoadAvg",
                     condition="gte", threshold=85.0, severity=AlertSeverity.WARNING,
                     description="CPU usage above 85%"),
                dict(name="Critical CPU Usage", metric_name="cpuLoadAvg",
                     condition="gte", threshold=95.0, severity=AlertSeverity.CRITICAL,
                     description="CPU usage above 95%"),
                dict(name="High Disk Usage", metric_name="diskUsedPercent",
                     condition="gte", threshold=85.0, severity=AlertSeverity.WARNING,
                     description="Disk usage above 85%"),
                dict(name="Critical Disk Usage", metric_name="diskUsedPercent",
                     condition="gte", threshold=95.0, severity=AlertSeverity.CRITICAL,
                     description="Disk usage above 95%"),
                # Cisco switch/router metrics
                dict(name="Cisco High CPU", metric_name="cpuBusyPer5min",
                     condition="gte", threshold=85.0, severity=AlertSeverity.WARNING,
                     description="Cisco CPU 5-min average above 85%"),
                dict(name="Cisco Critical CPU", metric_name="cpuBusyPer5min",
                     condition="gte", threshold=95.0, severity=AlertSeverity.CRITICAL,
                     description="Cisco CPU 5-min average above 95%"),
                dict(name="Cisco High Memory", metric_name="ciscoMemoryUsedPercent",
                     condition="gte", threshold=85.0, severity=AlertSeverity.WARNING,
                     description="Cisco memory usage above 85%"),
                dict(name="Cisco Critical Memory", metric_name="ciscoMemoryUsedPercent",
                     condition="gte", threshold=95.0, severity=AlertSeverity.CRITICAL,
                     description="Cisco memory usage above 95%"),
                dict(name="Cisco High Temperature", metric_name="ciscoEnvMonTemperatureValue",
                     condition="gte", threshold=65.0, severity=AlertSeverity.WARNING,
                     description="Cisco device temperature above 65°C"),
                dict(name="Cisco Critical Temperature", metric_name="ciscoEnvMonTemperatureValue",
                     condition="gte", threshold=75.0, severity=AlertSeverity.CRITICAL,
                     description="Cisco device temperature above 75°C"),
                # NTP rules
                dict(name="NTP Stratum Degraded", metric_name="ntp_stratum",
                     condition="gte", threshold=2.0, severity=AlertSeverity.WARNING,
                     description="NTP stratum is 2 or higher (expected stratum 1)"),
                dict(name="NTP Unsynchronized", metric_name="ntp_stratum",
                     condition="gte", threshold=16.0, severity=AlertSeverity.CRITICAL,
                     description="NTP stratum 16 — clock is unsynchronized"),
                dict(name="NTP High Offset", metric_name="ntp_offset_abs_ms",
                     condition="gte", threshold=10.0, severity=AlertSeverity.WARNING,
                     description="NTP clock offset exceeds 10ms"),
                dict(name="NTP Critical Offset", metric_name="ntp_offset_abs_ms",
                     condition="gte", threshold=100.0, severity=AlertSeverity.CRITICAL,
                     description="NTP clock offset exceeds 100ms"),
                dict(name="NTP Unreachable", metric_name="ntp_consecutive_failures",
                     condition="gte", threshold=3.0, severity=AlertSeverity.CRITICAL,
                     description="NTP server failed 3+ consecutive polls"),
            ]
            existing_names = set(
                sync_db.execute(select(AlertRule.name)).scalars().all()
            )
            added = 0
            for rule_data in default_rules:
                if rule_data["name"] not in existing_names:
                    sync_db.add(AlertRule(**rule_data))
                    added += 1
            if added:
                sync_db.commit()
                logger.info("Seeded %d new alert rules (%d total defined)", added, len(default_rules))
        finally:
            sync_db.close()
    except Exception:
        logger.warning("Could not seed default alert rules", exc_info=True)

    # Reconcile device status: any device with maintenance_mode=True must show MAINTENANCE
    try:
        from sqlalchemy import update
        from app.models.device import Device, DeviceStatus
        sync_db = SyncSessionLocal()
        try:
            res = sync_db.execute(
                update(Device)
                .where(Device.maintenance_mode == True, Device.status != DeviceStatus.MAINTENANCE)  # noqa: E712
                .values(status=DeviceStatus.MAINTENANCE, status_reason=None)
            )
            if res.rowcount:
                sync_db.commit()
                logger.info("Reconciled %d devices to MAINTENANCE status", res.rowcount)
            # Reverse: any device with maintenance_mode=False stuck at MAINTENANCE → ONLINE
            res2 = sync_db.execute(
                update(Device)
                .where(Device.maintenance_mode == False, Device.status == DeviceStatus.MAINTENANCE)  # noqa: E712
                .values(status=DeviceStatus.ONLINE, status_reason=None)
            )
            if res2.rowcount:
                sync_db.commit()
                logger.info("Reconciled %d stuck-MAINTENANCE devices to ONLINE", res2.rowcount)
        finally:
            sync_db.close()
    except Exception:
        logger.warning("Could not reconcile maintenance device status", exc_info=True)

    # Create default admin user if none exists
    try:
        from sqlalchemy import select, func
        from app.models.user import User
        from app.core.security import get_password_hash
        async with AsyncSessionLocal() as session:
            count = await session.execute(select(func.count(User.id)))
            if (count.scalar() or 0) == 0:
                default_password = "admin1234"
                admin = User(
                    username="admin",
                    email="admin@netmon.local",
                    hashed_password=get_password_hash(default_password),
                    full_name="Administrator",
                    role="admin",
                    is_active=True,
                    is_verified=True,
                    must_change_password=True,
                )
                session.add(admin)
                await session.commit()
                logger.info("=" * 60)
                logger.info("DEFAULT ADMIN CREDENTIALS")
                logger.info("  Username: admin")
                logger.info("  Password: admin1234")
                logger.info("  You MUST change this password on first login.")
                logger.info("=" * 60)
    except Exception:
        logger.warning("Could not create default admin user")

    # Start Redis pub/sub → WebSocket bridge
    redis_task = asyncio.create_task(_redis_ws_bridge())

    yield

    redis_task.cancel()
    try:
        await redis_task
    except asyncio.CancelledError:
        pass
    await async_engine.dispose()
    logger.info("Shutdown complete")


async def _redis_ws_bridge():
    """Subscribe to Redis pub/sub and broadcast messages to WebSocket clients."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(str(settings.REDIS_URL))
        pubsub = r.pubsub()
        await pubsub.subscribe("ws_broadcast")
        logger.info("Redis→WebSocket bridge started")
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await ws_manager.broadcast(data)
                except Exception:
                    pass
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.warning("Redis→WebSocket bridge not available (redis.asyncio may not be installed)")


_is_prod = settings.ENVIRONMENT == "production"

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Enterprise Network Monitoring System",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/")
async def root():
    if settings.ENVIRONMENT == "production":
        return {"status": "ok", "health": "/health"}
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")):
    # Validate JWT before accepting the connection
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    try:
        from app.core.security import decode_token
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4001, reason="Invalid token type")
            return
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"detail": "Resource not found"})


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(sites.router, prefix="/api/sites", tags=["Sites"])
app.include_router(snmp.router, prefix="/api/snmp", tags=["SNMP"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(scanner.router, prefix="/api/scanner", tags=["Discovery"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
app.include_router(map_images.router, prefix="/api/map-images", tags=["Map Images"])
app.include_router(ssl.router, prefix="/api/ssl", tags=["SSL Certificates"])

# Mount uploads directory for static file serving
os.makedirs(os.path.join(settings.UPLOAD_DIR, "maps"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
