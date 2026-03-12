# SPDX-License-Identifier: GPL-3.0-or-later
"""
SNMP credential management and testing endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.snmp import SNMPCredential, DeviceTemplate
from app.core.security import get_current_user, require_role
from app.schemas.snmp import (
    SNMPCredentialCreate, SNMPCredentialUpdate, SNMPCredentialResponse,
    SNMPTestRequest, SNMPTestResponse,
)
from app.core.encryption import encrypt_value, decrypt_value
from app.services import snmp_service

router = APIRouter()

_SENSITIVE_FIELDS = {"community", "auth_password", "priv_password"}


def _encrypt_sensitive(data: dict) -> dict:
    """Encrypt sensitive fields before storing."""
    for field in _SENSITIVE_FIELDS:
        if field in data and data[field]:
            data[field] = encrypt_value(data[field])
    return data


def _mask_credential(cred: SNMPCredential) -> SNMPCredentialResponse:
    resp = SNMPCredentialResponse.model_validate(cred)
    # Decrypt then mask for display
    if resp.community:
        plain = decrypt_value(resp.community)
        resp.community = plain[:2] + "****" if plain and len(plain) > 2 else "****"
    return resp


@router.get("/credentials", response_model=list[SNMPCredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(SNMPCredential).order_by(SNMPCredential.name))
    return [_mask_credential(c) for c in result.scalars().all()]


@router.post(
    "/credentials",
    response_model=SNMPCredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_credential(
    data: SNMPCredentialCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    cred = SNMPCredential(**_encrypt_sensitive(data.model_dump()))
    db.add(cred)
    await db.flush()
    await db.refresh(cred)
    return _mask_credential(cred)


@router.put("/credentials/{cred_id}", response_model=SNMPCredentialResponse)
async def update_credential(
    cred_id: int,
    data: SNMPCredentialUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    cred = await db.get(SNMPCredential, cred_id)
    if not cred:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Credential not found")
    updates = _encrypt_sensitive(data.model_dump(exclude_unset=True))
    for field, value in updates.items():
        setattr(cred, field, value)
    await db.flush()
    await db.refresh(cred)
    return _mask_credential(cred)


@router.delete("/credentials/{cred_id}")
async def delete_credential(
    cred_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    cred = await db.get(SNMPCredential, cred_id)
    if not cred:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Credential not found")
    await db.delete(cred)
    await db.flush()
    return {"detail": "Credential deleted"}


@router.post("/test", response_model=SNMPTestResponse)
async def test_snmp_credential(
    data: SNMPTestRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    cred = await db.get(SNMPCredential, data.credential_id)
    if not cred:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Credential not found")
    return snmp_service.test_credential(data.ip_address, cred)


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(DeviceTemplate).order_by(DeviceTemplate.name))
    return [
        {
            "id": t.id,
            "name": t.name,
            "device_type": t.device_type,
            "description": t.description,
            "enabled": t.enabled,
        }
        for t in result.scalars().all()
    ]
