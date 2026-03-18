# SPDX-License-Identifier: GPL-3.0-or-later
"""
Device business logic.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.device import Device, DeviceStatus
from app.models.site import Site
from app.models.alert import StatusHistory
from app.schemas.device import (
    DeviceCreate, DeviceUpdate, DeviceResponse,
    DeviceListResponse, DeviceStats,
)


def _device_to_response(device: Device) -> DeviceResponse:
    """Convert a Device ORM model to DeviceResponse, including site_name."""
    resp = DeviceResponse.model_validate(device)
    if hasattr(device, 'site') and device.site:
        resp.site_name = device.site.name
    return resp


async def get_devices(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 50,
    site_id: Optional[int] = None,
    status: Optional[str] = None,
    device_type: Optional[str] = None,
    search: Optional[str] = None,
) -> DeviceListResponse:
    query = select(Device)
    count_query = select(func.count(Device.id))

    if site_id:
        query = query.where(Device.site_id == site_id)
        count_query = count_query.where(Device.site_id == site_id)
    if status:
        query = query.where(Device.status == status)
        count_query = count_query.where(Device.status == status)
    if device_type:
        query = query.where(Device.device_type == device_type)
        count_query = count_query.where(Device.device_type == device_type)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            (Device.name.ilike(pattern)) | (Device.ip_address.ilike(pattern))
        )
        count_query = count_query.where(
            (Device.name.ilike(pattern)) | (Device.ip_address.ilike(pattern))
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    sort_order = case(
        (Device.status == 'offline', 0),
        (Device.status == 'warning', 1),
        (Device.maintenance_mode == True, 2),  # noqa: E712
        (Device.status == 'online', 3),
        else_=4,
    )
    query = query.options(joinedload(Device.site)).order_by(sort_order, Device.name).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    devices = result.scalars().unique().all()

    return DeviceListResponse(
        items=[_device_to_response(d) for d in devices],
        total=total,
        page=page,
        per_page=per_page,
    )


async def get_device(db: AsyncSession, device_id: int) -> Optional[Device]:
    result = await db.execute(
        select(Device).where(Device.id == device_id).options(joinedload(Device.site))
    )
    return result.scalar_one_or_none()


async def create_device(db: AsyncSession, data: DeviceCreate) -> Device:
    device = Device(**data.model_dump())
    db.add(device)
    await db.flush()
    # Re-fetch with site relationship eagerly loaded so _device_to_response works
    result = await db.execute(
        select(Device).where(Device.id == device.id).options(joinedload(Device.site))
    )
    return result.scalar_one()


async def update_device(
    db: AsyncSession, device_id: int, data: DeviceUpdate
) -> Optional[Device]:
    device = await get_device(db, device_id)
    if not device:
        return None
    updates = data.model_dump(exclude_unset=True)
    entering_maintenance = updates.get('maintenance_mode') is True and not device.maintenance_mode
    allowed_fields = {
        "name", "ip_address", "device_type", "site_id", "vlan",
        "snmp_enabled", "snmp_credential_id", "snmp_template_id",
        "http_url", "http_expected_status", "ntp_enabled", "web_check_enabled",
        "maintenance_mode", "maintenance_until", "alert_excluded_metrics",
        "notes", "map_x", "map_y",
    }
    for field, value in updates.items():
        if field in allowed_fields:
            setattr(device, field, value)
    device.updated_at = datetime.utcnow()

    # When alert exclusions change: resolve active alerts for excluded metrics
    if 'alert_excluded_metrics' in updates and updates['alert_excluded_metrics']:
        import json as _json
        from app.models.alert import Alert, AlertStatus as AStatus2
        try:
            excluded_names = set(_json.loads(updates['alert_excluded_metrics']))
        except (ValueError, TypeError):
            excluded_names = set()
        if excluded_names:
            # Also resolve "server_metrics" alerts if any server metric is excluded
            match_names = set(excluded_names)
            server_metrics = {"cpuLoadAvg", "memoryUsedPercent", "diskUsedPercent"}
            if excluded_names & server_metrics:
                match_names.add("server_metrics")
            exc_alerts = (await db.execute(
                select(Alert).where(
                    Alert.device_id == device_id,
                    Alert.metric_name.in_(match_names),
                    Alert.status.in_([AStatus2.ACTIVE, AStatus2.ACKNOWLEDGED]),
                )
            )).scalars().all()
            for alert in exc_alerts:
                alert.status = AStatus2.RESOLVED
                alert.resolved_at = datetime.utcnow()
            # Clear device status if no active alerts remain
            remaining = (await db.execute(
                select(func.count(Alert.id)).where(
                    Alert.device_id == device_id,
                    Alert.status == AStatus2.ACTIVE,
                )
            )).scalar() or 0
            if remaining == 0 and device.status != DeviceStatus.OFFLINE:
                device.status = DeviceStatus.ONLINE
                device.status_reason = None

    # When entering maintenance: resolve active alerts and clear status
    if entering_maintenance:
        from app.models.alert import Alert, AlertStatus
        active_alerts = (await db.execute(
            select(Alert).where(
                Alert.device_id == device_id,
                Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
            )
        )).scalars().all()
        for alert in active_alerts:
            alert.status = AlertStatus.RESOLVED
            alert.resolved_at = datetime.utcnow()
        device.status = DeviceStatus.ONLINE
        device.status_reason = None
        device.consecutive_failures = 0
        device.consecutive_successes = 0

    await db.flush()
    # Re-fetch with site relationship eagerly loaded
    result = await db.execute(
        select(Device).where(Device.id == device_id).options(joinedload(Device.site))
    )
    return result.scalar_one()


async def delete_device(db: AsyncSession, device_id: int) -> bool:
    device = await get_device(db, device_id)
    if not device:
        return False
    await db.delete(device)
    await db.flush()
    return True


async def get_device_stats(db: AsyncSession) -> DeviceStats:
    result = await db.execute(
        select(Device.status, func.count(Device.id)).group_by(Device.status)
    )
    counts = {row[0]: row[1] for row in result.all()}
    total = sum(counts.values())
    # Count maintenance devices separately
    maint_result = await db.execute(
        select(func.count(Device.id)).where(Device.maintenance_mode == True)  # noqa: E712
    )
    maintenance = maint_result.scalar() or 0
    return DeviceStats(
        total=total,
        online=counts.get(DeviceStatus.ONLINE, 0),
        warning=counts.get(DeviceStatus.WARNING, 0),
        offline=counts.get(DeviceStatus.OFFLINE, 0),
        unknown=counts.get(DeviceStatus.UNKNOWN, 0),
        maintenance=maintenance,
    )


async def toggle_maintenance(
    db: AsyncSession, device_id: int, until: Optional[datetime] = None
) -> Optional[Device]:
    device = await get_device(db, device_id)
    if not device:
        return None
    entering = not device.maintenance_mode
    device.maintenance_mode = entering
    device.maintenance_until = until if entering else None

    if entering:
        # Resolve active alerts and clear status
        from app.models.alert import Alert, AlertStatus as AStatus
        active_alerts = (await db.execute(
            select(Alert).where(
                Alert.device_id == device_id,
                Alert.status.in_([AStatus.ACTIVE, AStatus.ACKNOWLEDGED]),
            )
        )).scalars().all()
        for alert in active_alerts:
            alert.status = AStatus.RESOLVED
            alert.resolved_at = datetime.utcnow()
        device.status = DeviceStatus.ONLINE
        device.status_reason = None
        device.consecutive_failures = 0
        device.consecutive_successes = 0

    await db.flush()
    # Re-fetch with site relationship eagerly loaded
    result = await db.execute(
        select(Device).where(Device.id == device_id).options(joinedload(Device.site))
    )
    return result.scalar_one()


async def get_device_history(
    db: AsyncSession,
    device_id: int,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = 500,
) -> list:
    query = select(StatusHistory).where(StatusHistory.device_id == device_id)
    if start:
        query = query.where(StatusHistory.timestamp >= start)
    if end:
        query = query.where(StatusHistory.timestamp <= end)
    query = query.order_by(StatusHistory.timestamp.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())
