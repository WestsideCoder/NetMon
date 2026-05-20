# SPDX-License-Identifier: GPL-3.0-or-later
"""
User management endpoints (Admin only).
"""
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func

from app.database import get_db
from app.models.user import User, UserRole
from app.core.security import get_current_user, get_password_hash, require_role
from app.schemas.auth import UserCreate, UserUpdate, UserResponse

router = APIRouter()


@router.get("/", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    result = await db.execute(select(User).order_by(User.username))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    existing = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists")
    user = User(
        username=data.username,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=data.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    allowed_fields = {"email", "full_name", "role", "is_active"}
    updates = {f: v for f, v in data.model_dump(exclude_unset=True).items() if f in allowed_fields}
    if "email" in updates and updates["email"] != user.email:
        dup = await db.execute(
            select(User).where(User.email == updates["email"], User.id != user_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
    for field, value in updates.items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/deactivate")
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate your own account")
    user.is_active = False
    await db.flush()
    return {"detail": "User deactivated"}


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete your own account")
    if user.role == UserRole.ADMIN:
        admin_count = (await db.execute(
            select(func.count(User.id)).where(User.role == UserRole.ADMIN, User.is_active == True)  # noqa: E712
        )).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the last active admin")
    await db.delete(user)
    await db.flush()
    return {"detail": "User deleted"}


@router.post("/{user_id}/api-key")
async def generate_api_key(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.api_key = secrets.token_urlsafe(32)
    await db.flush()
    return {"api_key": user.api_key}
