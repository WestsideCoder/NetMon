# SPDX-License-Identifier: GPL-3.0-or-later
"""
Device CRUD and monitoring endpoints.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.device import Device
from app.models.snmp import SNMPData, DeviceTemplate
from app.core.security import get_current_user, require_role
from app.services import device_service
from app.services.device_service import _device_to_response
from app.schemas.device import (
    DeviceCreate, DeviceUpdate, DeviceResponse,
    DeviceListResponse, DeviceStats, DevicePositionUpdate,
    DeviceBulkUpdate,
)
from app.schemas.snmp import (
    SNMPDeviceDataResponse, SNMPMetricLatest, SNMPHistoryPoint,
    SNMPSummaryResponse, SNMPSummaryDevice,
)

router = APIRouter()

# Key metrics per device type for summary display
_KEY_METRICS = {
    "ups": ["upsAdvBatteryCapacity", "upsEstimatedChargeRemaining"],
    "server": ["cpuLoadAvg", "memoryUsedPercent", "diskUsedPercent", "hrProcessorLoad"],
    "switch": ["cpuBusyPer", "ifNumber"],
    "router": ["cpuBusyPer"],
}


@router.get("/", response_model=DeviceListResponse)
async def list_devices(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    site_id: Optional[int] = None,
    status: Optional[str] = None,
    device_type: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await device_service.get_devices(
        db, page=page, per_page=per_page,
        site_id=site_id, status=status,
        device_type=device_type, search=search,
    )


@router.get("/stats", response_model=DeviceStats)
async def device_stats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await device_service.get_device_stats(db)


@router.get("/snmp-summary", response_model=SNMPSummaryResponse)
async def snmp_summary(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Lightweight dashboard endpoint: latest key metric per SNMP-enabled device."""
    devices = (await db.execute(
        select(Device)
        .where(Device.snmp_enabled == True, Device.maintenance_mode == False)
        .options(joinedload(Device.snmp_template))
    )).scalars().unique().all()

    result = []
    for device in devices:
        template_name = device.snmp_template.name if device.snmp_template else None
        dtype = device.device_type.value if device.device_type else None

        # Determine which metric name to fetch
        candidate_names = _KEY_METRICS.get(dtype, [])
        metric_row = None
        for name in candidate_names:
            row = (await db.execute(
                select(SNMPData)
                .where(SNMPData.device_id == device.id, SNMPData.oid_name == name)
                .order_by(SNMPData.timestamp.desc())
                .limit(1)
            )).scalar_one_or_none()
            if row:
                metric_row = row
                break

        result.append(SNMPSummaryDevice(
            device_id=device.id,
            device_name=device.name,
            device_type=dtype,
            ip_address=device.ip_address,
            status=device.status.value if device.status else "unknown",
            key_metric_name=metric_row.oid_name if metric_row else None,
            key_metric_value=metric_row.value if metric_row else None,
            key_metric_type=metric_row.value_type if metric_row else None,
        ))

    return SNMPSummaryResponse(devices=result)


@router.patch("/bulk")
async def bulk_update_devices(
    data: DeviceBulkUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Bulk update multiple devices with the same field values."""
    if len(data.ids) > 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max 200 devices per bulk update")
    updates = data.updates.model_dump(exclude_unset=True)
    if not updates:
        return {"detail": "No updates provided", "updated_ids": []}
    updated = []
    for device_id in data.ids:
        result = await db.execute(select(Device).where(Device.id == device_id))
        device = result.scalar_one_or_none()
        if not device:
            continue
        for field, value in updates.items():
            setattr(device, field, value)
        updated.append(device_id)
    await db.flush()
    return {"detail": f"Updated {len(updated)} devices", "updated_ids": updated}


@router.patch("/positions")
async def update_positions(
    positions: list[DevicePositionUpdate],
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Batch update device map coordinates."""
    updated = []
    for pos in positions:
        result = await db.execute(select(Device).where(Device.id == pos.id))
        device = result.scalar_one_or_none()
        if not device:
            continue
        device.map_x = pos.map_x
        device.map_y = pos.map_y
        updated.append(device.id)
    await db.flush()
    return {"detail": f"Updated {len(updated)} device positions", "updated_ids": updated}


@router.post("/", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    data: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    device = await device_service.create_device(db, data)
    # Trigger immediate SNMP poll to pull name/template
    if device.snmp_enabled and device.snmp_credential_id:
        try:
            from app.tasks.snmp_poll import snmp_poll_device
            snmp_poll_device.delay(device.id)
        except Exception:
            pass  # Non-critical — next scheduled poll will catch it
    return _device_to_response(device)


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    device = await device_service.get_device(db, device_id)
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    return _device_to_response(device)


@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: int,
    data: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    device = await device_service.update_device(db, device_id, data)
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    # Trigger SNMP poll if SNMP was just enabled or credential changed
    if device.snmp_enabled and device.snmp_credential_id:
        try:
            from app.tasks.snmp_poll import snmp_poll_device
            snmp_poll_device.delay(device.id)
        except Exception:
            pass
    return _device_to_response(device)


@router.delete("/{device_id}")
async def delete_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    if not await device_service.delete_device(db, device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    return {"detail": "Device deleted"}


@router.post("/{device_id}/maintenance", response_model=DeviceResponse)
async def toggle_maintenance(
    device_id: int,
    until: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    device = await device_service.toggle_maintenance(db, device_id, until)
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    return _device_to_response(device)


@router.post("/{device_id}/test")
async def test_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Run ping, SNMP poll, and HTTP check for a single device on demand."""
    device = await device_service.get_device(db, device_id)
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")

    def _run_tests(ip: str, dev_id: int, snmp_enabled: bool, http_url: str | None, ntp_enabled: bool, web_check_enabled: bool) -> dict:
        from app.database import SyncSessionLocal
        from app.tasks.ping import _run_fping, _update_device_status
        from app.tasks.http_check import _check_device_url
        from app.models.device import DeviceStatus as DS
        from sqlalchemy.orm import joinedload as jl
        import logging
        import socket
        import struct
        import time as _time

        import httpx

        log = logging.getLogger(__name__)
        results: dict = {"ping": None, "snmp": None, "http": None, "ntp": None, "web": None}
        sync_db = SyncSessionLocal()
        try:
            dev = sync_db.execute(
                select(Device).where(Device.id == dev_id)
                .options(jl(Device.snmp_credential), jl(Device.snmp_template))
            ).scalar_one_or_none()
            if not dev:
                return results

            # -- Ping --
            try:
                ping_data = _run_fping([ip])
                ping_result = ping_data.get(ip, {"alive": False, "rtt": None})
                _update_device_status(sync_db, dev, ping_result)
                results["ping"] = {
                    "alive": ping_result["alive"],
                    "rtt": ping_result.get("rtt"),
                }
            except Exception:
                log.exception("Test ping failed for %s", ip)
                results["ping"] = {"alive": False, "rtt": None, "error": "Ping failed"}

            # -- SNMP --
            if snmp_enabled and dev.snmp_credential:
                try:
                    from app.tasks.snmp_poll import _poll_single_device
                    _poll_single_device(sync_db, dev)
                    results["snmp"] = {"success": True}
                except Exception as e:
                    log.exception("Test SNMP poll failed for %s", ip)
                    results["snmp"] = {"success": False, "error": str(e)}
                    if dev.status == DS.ONLINE:
                        dev.status = DS.WARNING
                        dev.status_reason = "SNMP"

            # -- HTTP (configured URL check) --
            if http_url:
                try:
                    _check_device_url(sync_db, dev)
                    results["http"] = {
                        "success": True,
                        "response_time": dev.http_response_time,
                    }
                except Exception as e:
                    log.exception("Test HTTP check failed for %s", ip)
                    results["http"] = {"success": False, "error": str(e)}
                    if dev.status == DS.ONLINE:
                        dev.status = DS.WARNING
                        dev.status_reason = "HTTP"

            # -- NTP --
            if ntp_enabled:
                from app.tasks.ntp_poll import _query_ntp
                ntp_result = _query_ntp(ip, timeout=3.0)
                if ntp_result["success"]:
                    results["ntp"] = {
                        "success": True,
                        "rtt": ntp_result["rtt_ms"],
                        "server_time": ntp_result["server_time"],
                        "offset": ntp_result["offset_ms"],
                        "stratum": ntp_result["stratum"],
                        "reference_id": ntp_result["reference_id"],
                    }
                    dev.ntp_offset_ms = ntp_result["offset_ms"]
                    dev.ntp_rtt_ms = ntp_result["rtt_ms"]
                    dev.ntp_server_time = ntp_result["server_time"]
                    dev.ntp_stratum = ntp_result["stratum"]
                    dev.ntp_reference_id = ntp_result["reference_id"]
                    dev.ntp_consecutive_failures = 0
                else:
                    results["ntp"] = {"success": False, "error": ntp_result.get("error", "Unknown")}
                    dev.ntp_consecutive_failures += 1
                    if dev.status == DS.ONLINE:
                        dev.status = DS.WARNING
                        dev.status_reason = "NTP"

            # -- Web (probe HTTP/HTTPS on device IP) --
            if web_check_enabled:
                web_result: dict = {"http_status": None, "https_status": None, "http_time": None, "https_time": None}
                for scheme in ("https", "http"):
                    url = f"{scheme}://{ip}/"
                    try:
                        t0 = _time.monotonic()
                        with httpx.Client(timeout=5, verify=False, follow_redirects=True) as client:
                            resp = client.get(url)
                        elapsed = round((_time.monotonic() - t0) * 1000, 1)
                        web_result[f"{scheme}_status"] = resp.status_code
                        web_result[f"{scheme}_time"] = elapsed
                    except Exception:
                        pass  # Leave as None — port closed or unreachable
                has_any = web_result["http_status"] is not None or web_result["https_status"] is not None
                results["web"] = {**web_result, "success": has_any}
                if not has_any and dev.status == DS.ONLINE:
                    dev.status = DS.WARNING
                    dev.status_reason = "Web"

            sync_db.commit()
        except Exception:
            sync_db.rollback()
            raise
        finally:
            sync_db.close()
        return results

    test_results = await asyncio.to_thread(
        _run_tests,
        device.ip_address,
        device.id,
        device.snmp_enabled,
        device.http_url,
        device.ntp_enabled,
        device.web_check_enabled,
    )
    return test_results


@router.get("/{device_id}/snmp", response_model=SNMPDeviceDataResponse)
async def device_snmp_data(
    device_id: int,
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return latest SNMP metrics and time-series history for a device."""
    device = await device_service.get_device(db, device_id)
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")

    # Get template info
    template_name = None
    device_type = device.device_type.value if device.device_type else None
    if device.snmp_template_id:
        tmpl = (await db.execute(
            select(DeviceTemplate).where(DeviceTemplate.id == device.snmp_template_id)
        )).scalar_one_or_none()
        if tmpl:
            template_name = tmpl.name

    cutoff = datetime.utcnow() - timedelta(hours=hours)

    # Get distinct OID names for this device
    oid_names_result = await db.execute(
        select(distinct(SNMPData.oid_name))
        .where(SNMPData.device_id == device_id, SNMPData.timestamp >= cutoff)
    )
    oid_names = [row[0] for row in oid_names_result.all()]

    # Latest value per OID
    latest = []
    history = {}
    for oid_name in oid_names:
        # Latest
        row = (await db.execute(
            select(SNMPData)
            .where(SNMPData.device_id == device_id, SNMPData.oid_name == oid_name)
            .order_by(SNMPData.timestamp.desc())
            .limit(1)
        )).scalar_one_or_none()
        if row:
            latest.append(SNMPMetricLatest(
                oid_name=row.oid_name,
                value=row.value,
                value_type=row.value_type,
                timestamp=row.timestamp,
            ))

        # History
        rows = (await db.execute(
            select(SNMPData)
            .where(
                SNMPData.device_id == device_id,
                SNMPData.oid_name == oid_name,
                SNMPData.timestamp >= cutoff,
            )
            .order_by(SNMPData.timestamp.asc())
        )).scalars().all()
        history[oid_name] = [
            SNMPHistoryPoint(timestamp=r.timestamp, value=r.value)
            for r in rows
        ]

    return SNMPDeviceDataResponse(
        device_id=device_id,
        device_type=device_type,
        template_name=template_name,
        latest=latest,
        history=history,
    )


@router.get("/{device_id}/history")
async def device_history(
    device_id: int,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    history = await device_service.get_device_history(db, device_id, start, end)
    return [
        {
            "id": h.id,
            "status": h.status,
            "response_time": h.response_time,
            "timestamp": h.timestamp.isoformat(),
        }
        for h in history
    ]
