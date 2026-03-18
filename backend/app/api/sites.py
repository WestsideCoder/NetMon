# SPDX-License-Identifier: GPL-3.0-or-later
"""
Site management endpoints.
"""
import os
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.models.site import Site
from app.models.device import Device
from app.core.security import get_current_user, require_role
from app.services import site_service
from app.schemas.site import (
    SiteCreate, SiteUpdate, SiteResponse, SiteTreeResponse,
    SiteChildWithStats, DeviceStatsBase, SitePositionUpdate,
)

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


def _safe_upload_path(url: str) -> str | None:
    """Resolve an upload URL to a safe filesystem path within UPLOAD_DIR."""
    if not url:
        return None
    # Strip /uploads/ prefix to get relative path
    rel = url.lstrip("/")
    if rel.startswith("uploads/"):
        rel = rel[len("uploads/"):]
    full = os.path.abspath(os.path.join(settings.UPLOAD_DIR, rel))
    if not full.startswith(os.path.abspath(settings.UPLOAD_DIR)):
        return None  # path traversal attempt
    return full


def _safe_image_ext(filename: str | None, content_type: str | None) -> str:
    """Extract and validate image file extension. Falls back to content_type."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            return ext
    # Derive from content_type
    ct_map = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}
    return ct_map.get(content_type or "", "png")


@router.get("/", response_model=list[SiteResponse])
async def list_sites(
    parent_id: Optional[int] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sites = await site_service.get_sites(db, parent_id=parent_id, search=search)
    return [await site_service.get_site_with_device_count(db, s) for s in sites]


@router.get("/tree", response_model=list[SiteTreeResponse])
async def site_tree(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return await site_service.get_site_tree(db)


@router.post("/", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
async def create_site(
    data: SiteCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    site = await site_service.create_site(db, data)
    return await site_service.get_site_with_device_count(db, site)


@router.patch("/positions")
async def update_site_positions(
    positions: list[SitePositionUpdate],
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Batch update map positions of child sites."""
    updated_ids = []
    for pos in positions:
        site = await site_service.get_site(db, pos.id)
        if site:
            site.map_x = pos.map_x
            site.map_y = pos.map_y
            updated_ids.append(pos.id)
    await db.flush()
    return {"updated": updated_ids}


ROOT_MAP_FILENAME = "root_map"


@router.get("/root-map")
async def get_root_map(
    _user: User = Depends(get_current_user),
):
    """Get the root/overview map image URL."""
    maps_dir = os.path.join(settings.UPLOAD_DIR, "maps")
    for ext in ("png", "jpg", "jpeg", "gif", "webp"):
        path = os.path.join(maps_dir, f"{ROOT_MAP_FILENAME}.{ext}")
        if os.path.exists(path):
            return {"map_image_url": f"/uploads/maps/{ROOT_MAP_FILENAME}.{ext}"}
    return {"map_image_url": None}


@router.post("/root-map")
async def upload_root_map(
    file: UploadFile = File(...),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Upload or replace the root/overview map image."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Invalid image type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image too large (max 10MB)")

    maps_dir = os.path.join(settings.UPLOAD_DIR, "maps")
    os.makedirs(maps_dir, exist_ok=True)

    # Delete any existing root map
    for ext in ("png", "jpg", "jpeg", "gif", "webp"):
        old_path = os.path.join(maps_dir, f"{ROOT_MAP_FILENAME}.{ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    ext = _safe_image_ext(file.filename, file.content_type)
    filename = f"{ROOT_MAP_FILENAME}.{ext}"
    filepath = os.path.join(maps_dir, filename)
    with open(filepath, "wb") as f:
        f.write(data)

    return {"map_image_url": f"/uploads/maps/{filename}"}


@router.delete("/root-map")
async def delete_root_map(
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Delete the root/overview map image."""
    maps_dir = os.path.join(settings.UPLOAD_DIR, "maps")
    for ext in ("png", "jpg", "jpeg", "gif", "webp"):
        path = os.path.join(maps_dir, f"{ROOT_MAP_FILENAME}.{ext}")
        if os.path.exists(path):
            os.remove(path)
    return {"detail": "Root map deleted"}


@router.get("/root-children", response_model=List[SiteChildWithStats])
async def root_children_with_stats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get top-level (root) sites with recursive device status breakdown."""
    children_result = await db.execute(
        select(Site).where(Site.parent_site_id.is_(None)).order_by(Site.name)
    )
    children = list(children_result.scalars().all())

    result = []
    for child in children:
        descendant_ids = await _get_descendant_ids(db, child.id)
        descendant_ids.append(child.id)

        stats_result = await db.execute(
            select(Device.status, func.count(Device.id))
            .where(Device.site_id.in_(descendant_ids))
            .group_by(Device.status)
        )
        status_counts = {row[0].value if hasattr(row[0], 'value') else row[0]: row[1] for row in stats_result.all()}

        total = sum(status_counts.values())
        device_stats = DeviceStatsBase(
            total=total,
            online=status_counts.get("online", 0),
            warning=status_counts.get("warning", 0),
            offline=status_counts.get("offline", 0),
            unknown=status_counts.get("unknown", 0),
        )

        result.append(SiteChildWithStats(
            id=child.id,
            name=child.name,
            location=child.location,
            level=child.level,
            map_image_url=child.map_image_url,
            map_x=child.map_x,
            map_y=child.map_y,
            device_stats=device_stats,
        ))

    return result


@router.get("/{site_id}", response_model=SiteResponse)
async def get_site(
    site_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    site = await site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return await site_service.get_site_with_device_count(db, site)


@router.put("/{site_id}", response_model=SiteResponse)
async def update_site(
    site_id: int,
    data: SiteUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    site = await site_service.update_site(db, site_id, data)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return await site_service.get_site_with_device_count(db, site)


@router.delete("/{site_id}")
async def delete_site(
    site_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    if not await site_service.delete_site(db, site_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return {"detail": "Site deleted"}


@router.post("/{site_id}/map-image", response_model=SiteResponse)
async def upload_map_image(
    site_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Upload a floor plan / map image for a site."""
    site = await site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")

    # Validate content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Invalid image type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    # Read and validate size
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image too large (max 10MB)")

    # Delete old image if exists
    if site.map_image_url:
        old_path = _safe_upload_path(site.map_image_url)
        if old_path and os.path.exists(old_path):
            os.remove(old_path)

    # Save new image
    ext = _safe_image_ext(file.filename, file.content_type)
    filename = f"map_{site_id}_{uuid.uuid4().hex[:8]}.{ext}"
    maps_dir = os.path.join(settings.UPLOAD_DIR, "maps")
    os.makedirs(maps_dir, exist_ok=True)
    filepath = os.path.join(maps_dir, filename)
    with open(filepath, "wb") as f:
        f.write(data)

    # Update site
    site.map_image_url = f"/uploads/maps/{filename}"
    await db.flush()
    await db.refresh(site)
    return await site_service.get_site_with_device_count(db, site)


@router.delete("/{site_id}/map-image", response_model=SiteResponse)
async def delete_map_image(
    site_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Remove the map image from a site."""
    site = await site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")

    if site.map_image_url:
        old_path = _safe_upload_path(site.map_image_url)
        if old_path and os.path.exists(old_path):
            os.remove(old_path)
        site.map_image_url = None
        site.map_image_id = None
        await db.flush()
        await db.refresh(site)

    return await site_service.get_site_with_device_count(db, site)


@router.post("/{site_id}/map-image-from-library", response_model=SiteResponse)
async def assign_library_image(
    site_id: int,
    image_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Assign a library image to a site's map."""
    from app.models.map_image import MapImage as MapImageModel
    site = await site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    img_result = await db.execute(select(MapImageModel).where(MapImageModel.id == image_id))
    img = img_result.scalar_one_or_none()
    if not img:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Map image not found")
    site.map_image_id = img.id
    site.map_image_url = f"/uploads/{img.file_path}"
    await db.flush()
    await db.refresh(site)
    return await site_service.get_site_with_device_count(db, site)


@router.get("/{site_id}/children-with-stats", response_model=List[SiteChildWithStats])
async def children_with_stats(
    site_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get child sites with recursive device status breakdown."""
    site = await site_service.get_site(db, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")

    # Get direct children
    children_result = await db.execute(
        select(Site).where(Site.parent_site_id == site_id).order_by(Site.name)
    )
    children = list(children_result.scalars().all())

    # For each child, recursively gather all descendant site IDs, then count devices by status
    result = []
    for child in children:
        descendant_ids = await _get_descendant_ids(db, child.id)
        descendant_ids.append(child.id)

        # Count devices by status across all descendant sites
        stats_result = await db.execute(
            select(Device.status, func.count(Device.id))
            .where(Device.site_id.in_(descendant_ids))
            .group_by(Device.status)
        )
        status_counts = {row[0].value if hasattr(row[0], 'value') else row[0]: row[1] for row in stats_result.all()}

        total = sum(status_counts.values())
        device_stats = DeviceStatsBase(
            total=total,
            online=status_counts.get("online", 0),
            warning=status_counts.get("warning", 0),
            offline=status_counts.get("offline", 0),
            unknown=status_counts.get("unknown", 0),
        )

        result.append(SiteChildWithStats(
            id=child.id,
            name=child.name,
            location=child.location,
            level=child.level,
            map_image_url=child.map_image_url,
            map_x=child.map_x,
            map_y=child.map_y,
            device_stats=device_stats,
        ))

    return result


async def _get_descendant_ids(db: AsyncSession, site_id: int) -> list[int]:
    """Recursively get all descendant site IDs."""
    children_result = await db.execute(
        select(Site.id).where(Site.parent_site_id == site_id)
    )
    child_ids = [row[0] for row in children_result.all()]
    all_ids = list(child_ids)
    for cid in child_ids:
        all_ids.extend(await _get_descendant_ids(db, cid))
    return all_ids
