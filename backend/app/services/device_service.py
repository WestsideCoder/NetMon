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

    status_order = case(
        (Device.status == 'offline', 0),
        (Device.status == 'warning', 1),
        (Device.status == 'online', 2),
        else_=3,
    )
    query = query.options(joinedload(Device.site)).order_by(status_order, Device.name).offset((page - 1) * per_page).limit(per_page)
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    device.updated_at = datetime.utcnow()
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
    return DeviceStats(
        total=total,
        online=counts.get(DeviceStatus.ONLINE, 0),
        warning=counts.get(DeviceStatus.WARNING, 0),
        offline=counts.get(DeviceStatus.OFFLINE, 0),
        unknown=counts.get(DeviceStatus.UNKNOWN, 0),
    )


async def toggle_maintenance(
    db: AsyncSession, device_id: int, until: Optional[datetime] = None
) -> Optional[Device]:
    device = await get_device(db, device_id)
    if not device:
        return None
    device.maintenance_mode = not device.maintenance_mode
    device.maintenance_until = until if device.maintenance_mode else None
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
