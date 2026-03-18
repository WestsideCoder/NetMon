# SPDX-License-Identifier: GPL-3.0-or-later
"""
SSL certificate management endpoints.
"""
import json
import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.models.ssl_certificate import SSLCertificate, CertificateType
from app.core.security import get_current_user, require_role
from app.schemas.ssl_certificate import (
    GenerateCARequest,
    GenerateCSRRequest,
    GenerateServerCertRequest,
    SSLCertificateResponse,
    SSLCertificateListResponse,
    SSLStatusResponse,
)
from app.services import ssl_service

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_PEM_SIZE = 1 * 1024 * 1024  # 1MB


def _cert_response(db_cert: SSLCertificate) -> SSLCertificateResponse:
    """Convert DB cert to response, computing has_csr."""
    data = SSLCertificateResponse.model_validate(db_cert)
    data.has_csr = bool(db_cert.csr_path)
    return data


@router.get("/", response_model=SSLCertificateListResponse)
async def list_certificates(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all SSL certificates."""
    result = await db.execute(
        select(SSLCertificate).order_by(SSLCertificate.created_at.desc())
    )
    certs = list(result.scalars().all())
    count_result = await db.execute(select(func.count(SSLCertificate.id)))
    total = count_result.scalar() or 0
    return SSLCertificateListResponse(items=[_cert_response(c) for c in certs], total=total)


@router.get("/status", response_model=SSLStatusResponse)
async def get_ssl_status(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get SSL status summary."""
    # Active CA
    ca_result = await db.execute(
        select(SSLCertificate).where(
            SSLCertificate.cert_type == CertificateType.CA,
            SSLCertificate.is_active == True,
        )
    )
    active_ca = ca_result.scalar_one_or_none()

    # Any CA exists?
    any_ca_result = await db.execute(
        select(func.count(SSLCertificate.id)).where(
            SSLCertificate.cert_type == CertificateType.CA
        )
    )
    has_ca = (any_ca_result.scalar() or 0) > 0

    # Active server/uploaded cert
    cert_result = await db.execute(
        select(SSLCertificate).where(
            SSLCertificate.cert_type != CertificateType.CA,
            SSLCertificate.is_active == True,
        )
    )
    active_cert = cert_result.scalar_one_or_none()

    nginx_reload = ssl_service.check_nginx_reload_available()

    return SSLStatusResponse(
        has_ca=has_ca,
        active_ca=active_ca,
        active_cert=active_cert,
        nginx_reload_available=nginx_reload,
    )


@router.post("/generate-ca", response_model=SSLCertificateResponse, status_code=status.HTTP_201_CREATED)
async def generate_ca(
    req: GenerateCARequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Generate a new self-signed CA certificate."""
    prefix = f"ca_{uuid.uuid4().hex[:8]}"
    try:
        cert_path, key_path = ssl_service.generate_ca(
            common_name=req.common_name,
            organization=req.organization,
            validity_days=req.validity_days,
            key_size=req.key_size,
            prefix=prefix,
        )
    except Exception as e:
        logger.error("CA generation failed: %s", e)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"CA generation failed: {e}")

    cert = ssl_service.parse_uploaded_cert(open(cert_path, "rb").read())
    meta = ssl_service.extract_cert_metadata(cert)

    db_cert = SSLCertificate(
        name=req.name,
        cert_type=CertificateType.CA,
        common_name=meta["common_name"],
        subject_alt_names=json.dumps(meta["subject_alt_names"]) if meta["subject_alt_names"] else None,
        issuer=meta["issuer"],
        serial_number=meta["serial_number"],
        not_before=meta["not_before"],
        not_after=meta["not_after"],
        fingerprint_sha256=meta["fingerprint_sha256"],
        cert_path=cert_path,
        key_path=key_path,
        is_active=True,
        is_ca=True,
        uploaded_by=user.id,
    )

    # Deactivate other CAs
    existing = await db.execute(
        select(SSLCertificate).where(
            SSLCertificate.cert_type == CertificateType.CA,
            SSLCertificate.is_active == True,
        )
    )
    for old in existing.scalars().all():
        old.is_active = False

    db.add(db_cert)
    await db.flush()
    await db.refresh(db_cert)
    return db_cert


@router.post("/generate-server", response_model=SSLCertificateResponse, status_code=status.HTTP_201_CREATED)
async def generate_server_cert(
    req: GenerateServerCertRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Generate a server certificate signed by the active CA."""
    # Find active CA
    ca_result = await db.execute(
        select(SSLCertificate).where(
            SSLCertificate.cert_type == CertificateType.CA,
            SSLCertificate.is_active == True,
        )
    )
    ca = ca_result.scalar_one_or_none()
    if not ca:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active CA found. Generate a CA first.")

    prefix = f"srv_{uuid.uuid4().hex[:8]}"
    try:
        cert_path, key_path = ssl_service.generate_server_cert(
            ca_cert_path=ca.cert_path,
            ca_key_path=ca.key_path,
            common_name=req.common_name,
            san_dns_names=req.san_dns_names,
            san_ip_addresses=req.san_ip_addresses,
            validity_days=req.validity_days,
            key_size=req.key_size,
            prefix=prefix,
        )
    except Exception as e:
        logger.error("Server cert generation failed: %s", e)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Certificate generation failed: {e}")

    cert = ssl_service.parse_uploaded_cert(open(cert_path, "rb").read())
    meta = ssl_service.extract_cert_metadata(cert)

    db_cert = SSLCertificate(
        name=req.name,
        cert_type=CertificateType.SERVER,
        common_name=meta["common_name"],
        subject_alt_names=json.dumps(meta["subject_alt_names"]) if meta["subject_alt_names"] else None,
        issuer=meta["issuer"],
        serial_number=meta["serial_number"],
        not_before=meta["not_before"],
        not_after=meta["not_after"],
        fingerprint_sha256=meta["fingerprint_sha256"],
        cert_path=cert_path,
        key_path=key_path,
        ca_cert_path=ca.cert_path,
        is_active=False,
        is_ca=False,
        uploaded_by=user.id,
    )
    db.add(db_cert)
    await db.flush()
    await db.refresh(db_cert)
    return db_cert


@router.post("/upload", response_model=SSLCertificateResponse, status_code=status.HTTP_201_CREATED)
async def upload_certificate(
    cert_file: UploadFile = File(...),
    key_file: UploadFile = File(...),
    name: str = Form("Uploaded Certificate"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Upload a certificate and private key (PEM format)."""
    cert_data = await cert_file.read()
    key_data = await key_file.read()

    if len(cert_data) > MAX_PEM_SIZE or len(key_data) > MAX_PEM_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large (max 1MB)")

    # Validate PEM files
    try:
        cert = ssl_service.parse_uploaded_cert(cert_data)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid certificate PEM file")

    try:
        ssl_service.parse_uploaded_key(key_data)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid private key PEM file")

    prefix = f"upl_{uuid.uuid4().hex[:8]}"
    cert_path, key_path = ssl_service.save_uploaded_files(cert_data, key_data, prefix)

    meta = ssl_service.extract_cert_metadata(cert)
    cert_type = CertificateType.CA if meta["is_ca"] else CertificateType.UPLOADED

    db_cert = SSLCertificate(
        name=name.strip() or "Uploaded Certificate",
        cert_type=cert_type,
        common_name=meta["common_name"],
        subject_alt_names=json.dumps(meta["subject_alt_names"]) if meta["subject_alt_names"] else None,
        issuer=meta["issuer"],
        serial_number=meta["serial_number"],
        not_before=meta["not_before"],
        not_after=meta["not_after"],
        fingerprint_sha256=meta["fingerprint_sha256"],
        cert_path=cert_path,
        key_path=key_path,
        is_active=False,
        is_ca=meta["is_ca"],
        uploaded_by=user.id,
    )
    db.add(db_cert)
    await db.flush()
    await db.refresh(db_cert)
    return db_cert


@router.post("/generate-csr", response_model=SSLCertificateResponse, status_code=status.HTTP_201_CREATED)
async def generate_csr(
    req: GenerateCSRRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Generate a CSR and private key. Download the CSR, submit to a CA, then upload the signed cert."""
    prefix = f"csr_{uuid.uuid4().hex[:8]}"
    try:
        csr_path, key_path = ssl_service.generate_csr(
            common_name=req.common_name,
            organization=req.organization,
            san_dns_names=req.san_dns_names,
            san_ip_addresses=req.san_ip_addresses,
            key_size=req.key_size,
            prefix=prefix,
        )
    except Exception as e:
        logger.error("CSR generation failed: %s", e)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"CSR generation failed: {e}")

    csr_meta = ssl_service.extract_csr_metadata(csr_path)

    db_cert = SSLCertificate(
        name=req.name,
        cert_type=CertificateType.CSR,
        common_name=csr_meta["common_name"],
        subject_alt_names=json.dumps(csr_meta["subject_alt_names"]) if csr_meta["subject_alt_names"] else None,
        cert_path="",  # no cert yet — pending
        key_path=key_path,
        csr_path=csr_path,
        is_active=False,
        is_ca=False,
        uploaded_by=user.id,
    )
    db.add(db_cert)
    await db.flush()
    await db.refresh(db_cert)
    return _cert_response(db_cert)


@router.get("/{cert_id}/download-csr")
async def download_csr(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Download the CSR PEM file to submit to an external CA."""
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == cert_id))
    cert = result.scalar_one_or_none()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    if not cert.csr_path or not os.path.exists(cert.csr_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "CSR file not found")

    filename = f"{cert.name.replace(' ', '_')}.csr.pem"
    return FileResponse(cert.csr_path, media_type="application/x-pem-file", filename=filename)


@router.post("/{cert_id}/complete-csr", response_model=SSLCertificateResponse)
async def complete_csr(
    cert_id: int,
    cert_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Upload the signed certificate from the CA to complete a pending CSR."""
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == cert_id))
    db_cert = result.scalar_one_or_none()
    if not db_cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    if db_cert.cert_type != CertificateType.CSR:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This certificate is not a pending CSR")

    cert_data = await cert_file.read()
    if len(cert_data) > MAX_PEM_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large (max 1MB)")

    try:
        cert_obj = ssl_service.parse_uploaded_cert(cert_data)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid certificate PEM file")

    meta = ssl_service.extract_cert_metadata(cert_obj)

    # Save the signed cert next to the existing key
    cert_path = db_cert.csr_path.replace("_csr.pem", "_cert.pem")
    # Validate path is within SSL store directory
    ssl_store = os.path.abspath(ssl_service.SSL_STORE_DIR)
    if not os.path.abspath(cert_path).startswith(ssl_store):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid certificate path")
    with open(cert_path, "wb") as f:
        f.write(cert_data)

    # Update the record
    db_cert.cert_type = CertificateType.SERVER
    db_cert.cert_path = cert_path
    db_cert.common_name = meta["common_name"]
    db_cert.subject_alt_names = json.dumps(meta["subject_alt_names"]) if meta["subject_alt_names"] else None
    db_cert.issuer = meta["issuer"]
    db_cert.serial_number = meta["serial_number"]
    db_cert.not_before = meta["not_before"]
    db_cert.not_after = meta["not_after"]
    db_cert.fingerprint_sha256 = meta["fingerprint_sha256"]

    await db.flush()
    await db.refresh(db_cert)
    return _cert_response(db_cert)


@router.post("/{cert_id}/activate")
async def activate_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Activate a certificate — deploy to nginx SSL directory."""
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == cert_id))
    cert = result.scalar_one_or_none()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")

    if cert.is_ca:
        # Activating a CA — deactivate other CAs
        existing = await db.execute(
            select(SSLCertificate).where(
                SSLCertificate.cert_type == CertificateType.CA,
                SSLCertificate.is_active == True,
            )
        )
        for old in existing.scalars().all():
            old.is_active = False
        cert.is_active = True
    else:
        # Activating a server/uploaded cert — deploy to nginx
        try:
            ssl_service.activate_cert(cert.cert_path, cert.key_path, cert.ca_cert_path)
        except Exception as e:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to deploy certificate: {e}")

        # Deactivate other non-CA certs
        existing = await db.execute(
            select(SSLCertificate).where(
                SSLCertificate.cert_type != CertificateType.CA,
                SSLCertificate.is_active == True,
            )
        )
        for old in existing.scalars().all():
            old.is_active = False
        cert.is_active = True

    await db.flush()
    return {"detail": "Certificate activated", "nginx_reload_needed": not cert.is_ca}


@router.get("/{cert_id}/download-cert")
async def download_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Download a certificate PEM file."""
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == cert_id))
    cert = result.scalar_one_or_none()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")

    if not os.path.exists(cert.cert_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate file not found on disk")

    filename = f"{cert.name.replace(' ', '_')}.pem"
    return FileResponse(cert.cert_path, media_type="application/x-pem-file", filename=filename)


@router.get("/ca/download")
async def download_ca_cert(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Download the active CA certificate for client distribution."""
    result = await db.execute(
        select(SSLCertificate).where(
            SSLCertificate.cert_type == CertificateType.CA,
            SSLCertificate.is_active == True,
        )
    )
    ca = result.scalar_one_or_none()
    if not ca:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active CA certificate found")

    if not os.path.exists(ca.cert_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "CA certificate file not found on disk")

    return FileResponse(ca.cert_path, media_type="application/x-pem-file", filename="netmon_ca.pem")


@router.delete("/{cert_id}")
async def delete_certificate(
    cert_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Delete a certificate. Cannot delete active certificates."""
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == cert_id))
    cert = result.scalar_one_or_none()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")

    ssl_service.delete_cert_files(cert.cert_path, cert.key_path, cert.ca_cert_path)
    await db.delete(cert)
    await db.flush()
    return {"detail": "Certificate deleted"}


@router.post("/reload-nginx")
async def reload_nginx(
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Trigger nginx reload to pick up new SSL certificates."""
    success = ssl_service.reload_nginx()
    if not success:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Could not reload nginx. Docker socket may not be available. Restart nginx manually.",
        )
    return {"detail": "Nginx reloaded successfully"}
