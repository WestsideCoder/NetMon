# SPDX-License-Identifier: GPL-3.0-or-later
"""
Authentication endpoints: login, refresh, logout, profile.
"""
import time
from collections import defaultdict
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User, AuthSource

# Simple in-memory rate limiter for login attempts
_login_attempts: dict[str, list[float]] = defaultdict(list)
_LOGIN_WINDOW = 300  # 5 minutes
_LOGIN_MAX_ATTEMPTS = 10


def _check_login_rate(key: str) -> None:
    """Raise 429 if too many login attempts from this IP."""
    now = time.time()
    attempts = _login_attempts[key]
    # Prune old entries
    _login_attempts[key] = [t for t in attempts if now - t < _LOGIN_WINDOW]
    if len(_login_attempts[key]) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in a few minutes.",
        )
    _login_attempts[key].append(now)

from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, blocklist_token, oauth2_scheme,
)
from app.schemas.auth import (
    LoginRequest, TokenResponse, RefreshRequest,
    ChangePasswordRequest, UserResponse, UserUpdate,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = request.headers.get("X-Real-IP", request.client.host if request.client else "unknown")
    _check_login_rate(client_ip)

    # Try local auth first
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if user and user.auth_source == AuthSource.LOCAL:
        if not verify_password(data.password, user.hashed_password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    elif settings.LDAP_ENABLED:
        from app.core.ldap import LDAPAuthenticator
        ldap_auth = LDAPAuthenticator()
        ldap_result = ldap_auth.authenticate(data.username, data.password)
        if not ldap_result:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
        if not user:
            user = User(
                username=ldap_result["username"],
                email=ldap_result["email"],
                hashed_password="ldap-managed",
                full_name=ldap_result["full_name"],
                role=ldap_result["role"],
                auth_source=AuthSource.LDAP,
                ldap_dn=ldap_result["dn"],
                is_active=True,
            )
            db.add(user)
            await db.flush()
            await db.refresh(user)
        else:
            user.role = ldap_result["role"]
            user.ldap_dn = ldap_result["dn"]
    else:
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
        if not verify_password(data.password, user.hashed_password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    user.last_login = datetime.utcnow()
    await db.flush()

    token_data = {"sub": user.username, "role": user.role.value}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    username = payload.get("sub")
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    # Blocklist the old refresh token to prevent replay
    old_jti = payload.get("jti")
    if old_jti:
        ttl = max(int(payload.get("exp", 0) - time.time()), 0)
        blocklist_token(old_jti, ttl)

    token_data = {"sub": user.username, "role": user.role.value}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout(
    data: Optional[RefreshRequest] = None,
    current_user: User = Depends(get_current_user),
    access_token: str = Depends(oauth2_scheme),
):
    # Blocklist the access token
    try:
        access_payload = decode_token(access_token)
        access_jti = access_payload.get("jti")
        if access_jti:
            ttl = max(int(access_payload.get("exp", 0) - time.time()), 0)
            blocklist_token(access_jti, ttl)
    except Exception:
        pass

    # Blocklist the refresh token if provided
    if data and data.refresh_token:
        try:
            payload = decode_token(data.refresh_token)
            jti = payload.get("jti")
            exp = payload.get("exp", 0)
            if jti:
                ttl = max(int(exp - time.time()), 0)
                blocklist_token(jti, ttl)
        except Exception:
            pass  # Token already expired or invalid — safe to ignore
    return {"detail": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Users can only update their own email and full_name
    if data.email is not None:
        current_user.email = data.email
    if data.full_name is not None:
        current_user.full_name = data.full_name
    await db.flush()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.auth_source != AuthSource.LOCAL:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password managed by LDAP")
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    current_user.hashed_password = get_password_hash(data.new_password)
    current_user.must_change_password = False
    await db.flush()
    return {"detail": "Password changed successfully"}
