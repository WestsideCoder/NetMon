# SPDX-License-Identifier: GPL-3.0-or-later
"""
Map image library endpoints.
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.models.map_image import MapImage
from app.models.site import Site
from app.core.security import get_current_user, require_role
from app.schemas.map_image import MapImageResponse, MapImageListResponse

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


@router.get("/", response_model=MapImageListResponse)
async def list_map_images(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all library images."""
    result = await db.execute(select(MapImage).order_by(MapImage.created_at.desc()))
    images = list(result.scalars().all())
    count_result = await db.execute(select(func.count(MapImage.id)))
    total = count_result.scalar() or 0
    return MapImageListResponse(items=images, total=total)


@router.post("/", response_model=MapImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_map_image(
    file: UploadFile = File(...),
    name: str = Form(""),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Upload an image to the library."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Invalid image type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image too large (max 10MB)")

    ext = "png"
    if file.filename and "." in file.filename:
        raw_ext = file.filename.rsplit(".", 1)[-1].lower()
        if raw_ext in ALLOWED_IMAGE_EXTENSIONS:
            ext = raw_ext
    filename = f"lib_{uuid.uuid4().hex[:8]}.{ext}"
    maps_dir = os.path.join(settings.UPLOAD_DIR, "maps")
    os.makedirs(maps_dir, exist_ok=True)
    filepath = os.path.join(maps_dir, filename)
    with open(filepath, "wb") as f:
        f.write(data)

    display_name = name.strip() if name.strip() else (file.filename or filename)
    image = MapImage(
        name=display_name,
        filename=filename,
        file_path=f"maps/{filename}",
        file_size=len(data),
        content_type=file.content_type or "image/png",
        uploaded_by=user.id,
    )
    db.add(image)
    await db.flush()
    await db.refresh(image)
    return image


@router.delete("/{image_id}")
async def delete_map_image(
    image_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    """Delete a library image. Blocks if any site references it."""
    result = await db.execute(select(MapImage).where(MapImage.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    # Check if any sites reference this image
    ref_result = await db.execute(
        select(func.count(Site.id)).where(Site.map_image_id == image_id)
    )
    ref_count = ref_result.scalar() or 0
    if ref_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot delete: {ref_count} site(s) use this image. Remove from those sites first.",
        )

    # Delete file
    filepath = os.path.join(settings.UPLOAD_DIR, image.file_path)
    if os.path.exists(filepath):
        os.remove(filepath)

    await db.delete(image)
    await db.flush()
    return {"detail": "Image deleted"}
