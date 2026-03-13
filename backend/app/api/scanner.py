# SPDX-License-Identifier: GPL-3.0-or-later
"""
Network discovery/scanner endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.device import Device
from app.models.snmp import SNMPCredential
from app.core.security import require_role
from app.services import scanner_service
from app.schemas.scanner import ScanRequest, ScanResultResponse, ImportRequest

router = APIRouter()


@router.post("/scan", response_model=ScanResultResponse)
async def scan_network(
    data: ScanRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    # Load SNMP credentials if test_snmp is requested
    credentials = []
    if data.test_snmp:
        if data.credential_ids:
            for cid in data.credential_ids:
                cred = await db.get(SNMPCredential, cid)
                if cred and cred.enabled:
                    credentials.append(cred)
        else:
            result = await db.execute(
                select(SNMPCredential).where(SNMPCredential.enabled == True)
            )
            credentials = list(result.scalars().all())

    # Detach ORM objects from session so the background thread can safely
    # access their attributes after the async session is closed.
    for cred in credentials:
        db.expunge(cred)

    return scanner_service.start_scan(
        data.range, data.site_id,
        test_snmp=data.test_snmp,
        credential_ids=data.credential_ids,
        credentials=credentials,
    )


@router.get("/results/{scan_id}", response_model=ScanResultResponse)
async def get_scan_results(
    scan_id: str,
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    result = scanner_service.get_scan_result(scan_id)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")
    return result


@router.post("/import")
async def import_devices(
    data: ImportRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    scan = scanner_service.get_scan_result(data.scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found")

    # Pre-load templates for matching
    from app.models.snmp import DeviceTemplate
    templates_result = await db.execute(
        select(DeviceTemplate).where(DeviceTemplate.enabled == True)
    )
    db_templates = list(templates_result.scalars().all())

    imported = 0
    for dev in scan.devices:
        if dev.ip_address in data.devices and dev.is_alive:
            # Try to match SNMP template
            template_id = None
            if dev.snmp_credential_id and db_templates:
                sys_descr = dev.snmp_sys_descr or ""
                sys_obj_id = dev.snmp_sys_object_id or ""
                dtype = dev.detected_type or ""
                best_tmpl = None
                best_score = 0
                for tmpl in db_templates:
                    score = 0
                    if tmpl.sys_object_id_pattern and tmpl.sys_object_id_pattern in sys_obj_id:
                        score += 10
                    if tmpl.sys_descr_pattern and tmpl.sys_descr_pattern.lower() in sys_descr.lower():
                        score += 5
                    if dtype and tmpl.device_type == dtype:
                        score += 2
                    if score > best_score:
                        best_score = score
                        best_tmpl = tmpl
                if best_tmpl:
                    template_id = best_tmpl.id

            device = Device(
                name=dev.snmp_sys_name or dev.hostname or dev.ip_address,
                ip_address=dev.ip_address,
                site_id=data.site_id,
                device_type=dev.detected_type,
                snmp_enabled=dev.snmp_credential_id is not None,
                snmp_credential_id=dev.snmp_credential_id,
                snmp_template_id=template_id,
            )
            db.add(device)
            imported += 1
    if imported:
        await db.commit()
        # Trigger SNMP polls for newly imported devices with SNMP enabled
        try:
            from app.tasks.snmp_poll import snmp_poll_device
            for dev in scan.devices:
                if dev.ip_address in data.devices and dev.is_alive and dev.snmp_credential_id:
                    # Look up the device we just created
                    result = await db.execute(
                        select(Device).where(Device.ip_address == dev.ip_address)
                    )
                    new_device = result.scalar_one_or_none()
                    if new_device:
                        snmp_poll_device.delay(new_device.id)
        except Exception:
            pass  # Non-critical
    return {"imported": imported}
