# SPDX-License-Identifier: GPL-3.0-or-later
"""
Site business logic.
"""
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.site import Site
from app.models.device import Device
from app.models.device import DeviceStatus
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse, SiteTreeResponse, DeviceStatsBase


async def get_sites(
    db: AsyncSession,
    parent_id: Optional[int] = None,
    search: Optional[str] = None,
) -> List[Site]:
    query = select(Site)
    if parent_id is not None:
        query = query.where(Site.parent_site_id == parent_id)
    if search:
        query = query.where(Site.name.ilike(f"%{search}%"))
    query = query.order_by(Site.name)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_site_tree(db: AsyncSession) -> List[SiteTreeResponse]:
    result = await db.execute(
        select(Site).options(selectinload(Site.children)).order_by(Site.name)
    )
    all_sites = result.scalars().unique().all()

    # Count devices per site grouped by status
    status_counts_result = await db.execute(
        select(Device.site_id, Device.status, func.count(Device.id))
        .group_by(Device.site_id, Device.status)
    )
    # Build {site_id: {status: count}}
    status_map: dict[int, dict[str, int]] = {}
    for site_id, dev_status, count in status_counts_result.all():
        status_map.setdefault(site_id, {})[dev_status.value if hasattr(dev_status, 'value') else dev_status] = count

    def _make_stats(site_id: int) -> DeviceStatsBase:
        counts = status_map.get(site_id, {})
        return DeviceStatsBase(
            total=sum(counts.values()),
            online=counts.get("online", 0),
            warning=counts.get("warning", 0),
            offline=counts.get("offline", 0),
            unknown=counts.get("unknown", 0),
        )

    def build_tree(site: Site) -> SiteTreeResponse:
        child_nodes = [build_tree(c) for c in sorted(site.children, key=lambda s: s.name.lower())]
        own_stats = _make_stats(site.id)
        # Aggregate children stats into this node
        agg = DeviceStatsBase(
            total=own_stats.total,
            online=own_stats.online,
            warning=own_stats.warning,
            offline=own_stats.offline,
            unknown=own_stats.unknown,
        )
        for ch in child_nodes:
            agg.total += ch.device_stats.total
            agg.online += ch.device_stats.online
            agg.warning += ch.device_stats.warning
            agg.offline += ch.device_stats.offline
            agg.unknown += ch.device_stats.unknown
        return SiteTreeResponse(
            id=site.id,
            name=site.name,
            location=site.location,
            level=site.level,
            map_image_url=site.map_image_url,
            map_x=site.map_x,
            map_y=site.map_y,
            device_count=agg.total,
            device_stats=agg,
            children=child_nodes,
        )

    roots = [s for s in all_sites if s.parent_site_id is None]
    return [build_tree(r) for r in roots]


async def get_site(db: AsyncSession, site_id: int) -> Optional[Site]:
    result = await db.execute(select(Site).where(Site.id == site_id))
    return result.scalar_one_or_none()


async def get_site_with_device_count(db: AsyncSession, site: Site) -> SiteResponse:
    count_result = await db.execute(
        select(func.count(Device.id)).where(Device.site_id == site.id)
    )
    device_count = count_result.scalar() or 0
    return SiteResponse(
        id=site.id,
        name=site.name,
        location=site.location,
        description=site.description,
        parent_site_id=site.parent_site_id,
        level=site.level,
        contact_name=site.contact_name,
        contact_email=site.contact_email,
        map_image_url=site.map_image_url,
        map_config=site.map_config,
        map_x=site.map_x,
        map_y=site.map_y,
        device_count=device_count,
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


async def create_site(db: AsyncSession, data: SiteCreate) -> Site:
    level = 1
    if data.parent_site_id:
        parent = await get_site(db, data.parent_site_id)
        if not parent:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent site not found")
        if parent.level >= 4:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max hierarchy depth is 4")
        level = parent.level + 1

    site = Site(**data.model_dump(), level=level)
    db.add(site)
    await db.flush()
    await db.refresh(site)
    return site


async def update_site(
    db: AsyncSession, site_id: int, data: SiteUpdate
) -> Optional[Site]:
    site = await get_site(db, site_id)
    if not site:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(site, field, value)
    await db.flush()
    await db.refresh(site)
    return site


async def delete_site(db: AsyncSession, site_id: int) -> bool:
    site = await get_site(db, site_id)
    if not site:
        return False
    # Check for children
    children_result = await db.execute(
        select(func.count(Site.id)).where(Site.parent_site_id == site_id)
    )
    if (children_result.scalar() or 0) > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot delete site with child sites",
        )
    # Check for devices
    device_result = await db.execute(
        select(func.count(Device.id)).where(Device.site_id == site_id)
    )
    if (device_result.scalar() or 0) > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot delete site with devices",
        )
    await db.delete(site)
    await db.flush()
    return True
