# SPDX-License-Identifier: GPL-3.0-or-later
"""
Monitoring, email, and DHCP settings endpoints — exposes tunable config values.
"""
import asyncio
import csv
import io
import logging
import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.device import Device
from app.models.user import User, UserRole
from app.core.security import get_current_user, require_role
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class MonitoringSettings(BaseModel):
    ping_interval: int
    snmp_poll_interval: int
    http_check_interval: int
    missed_pings_warning: int
    missed_pings_critical: int
    cpu_warning_percent: int
    cpu_critical_percent: int
    memory_warning_percent: int
    memory_critical_percent: int
    disk_warning_percent: int
    disk_critical_percent: int
    dns_servers: str = ""


@router.get("/monitoring", response_model=MonitoringSettings)
async def get_monitoring_settings(
    _user: User = Depends(get_current_user),
):
    return MonitoringSettings(
        ping_interval=settings.PING_INTERVAL,
        snmp_poll_interval=settings.SNMP_POLL_INTERVAL,
        http_check_interval=settings.HTTP_CHECK_INTERVAL,
        missed_pings_warning=settings.MISSED_PINGS_WARNING,
        missed_pings_critical=settings.MISSED_PINGS_CRITICAL,
        cpu_warning_percent=settings.CPU_WARNING_PERCENT,
        cpu_critical_percent=settings.CPU_CRITICAL_PERCENT,
        memory_warning_percent=settings.MEMORY_WARNING_PERCENT,
        memory_critical_percent=settings.MEMORY_CRITICAL_PERCENT,
        disk_warning_percent=settings.DISK_WARNING_PERCENT,
        disk_critical_percent=settings.DISK_CRITICAL_PERCENT,
        dns_servers=settings.DNS_SERVERS,
    )


@router.put("/monitoring", response_model=MonitoringSettings)
async def update_monitoring_settings(
    data: MonitoringSettings,
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    # Update in-memory settings
    settings.PING_INTERVAL = data.ping_interval
    settings.SNMP_POLL_INTERVAL = data.snmp_poll_interval
    settings.HTTP_CHECK_INTERVAL = data.http_check_interval
    settings.MISSED_PINGS_WARNING = data.missed_pings_warning
    settings.MISSED_PINGS_CRITICAL = data.missed_pings_critical
    settings.CPU_WARNING_PERCENT = data.cpu_warning_percent
    settings.CPU_CRITICAL_PERCENT = data.cpu_critical_percent
    settings.MEMORY_WARNING_PERCENT = data.memory_warning_percent
    settings.MEMORY_CRITICAL_PERCENT = data.memory_critical_percent
    settings.DISK_WARNING_PERCENT = data.disk_warning_percent
    settings.DISK_CRITICAL_PERCENT = data.disk_critical_percent
    settings.DNS_SERVERS = data.dns_servers

    # Persist to .env so they survive restarts
    env_path = "/app/.env"
    _update_env(env_path, {
        "PING_INTERVAL": str(data.ping_interval),
        "SNMP_POLL_INTERVAL": str(data.snmp_poll_interval),
        "HTTP_CHECK_INTERVAL": str(data.http_check_interval),
        "MISSED_PINGS_WARNING": str(data.missed_pings_warning),
        "MISSED_PINGS_CRITICAL": str(data.missed_pings_critical),
        "CPU_WARNING_PERCENT": str(data.cpu_warning_percent),
        "CPU_CRITICAL_PERCENT": str(data.cpu_critical_percent),
        "MEMORY_WARNING_PERCENT": str(data.memory_warning_percent),
        "MEMORY_CRITICAL_PERCENT": str(data.memory_critical_percent),
        "DISK_WARNING_PERCENT": str(data.disk_warning_percent),
        "DISK_CRITICAL_PERCENT": str(data.disk_critical_percent),
        "DNS_SERVERS": data.dns_servers,
    })

    return data


class SmtpSettings(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None  # write-only; GET returns masked value
    smtp_from: str
    smtp_use_tls: bool


class SmtpTestRequest(BaseModel):
    to: str


class SmtpTestResponse(BaseModel):
    success: bool
    message: str


@router.get("/email", response_model=SmtpSettings)
async def get_email_settings(
    _user: User = Depends(get_current_user),
):
    return SmtpSettings(
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        smtp_username=settings.SMTP_USERNAME or "",
        smtp_password="****" if settings.SMTP_PASSWORD else "",
        smtp_from=settings.SMTP_FROM,
        smtp_use_tls=settings.SMTP_USE_TLS,
    )


@router.put("/email", response_model=SmtpSettings)
async def update_email_settings(
    data: SmtpSettings,
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    settings.SMTP_HOST = data.smtp_host
    settings.SMTP_PORT = data.smtp_port
    settings.SMTP_USERNAME = data.smtp_username or None
    # Update password: masked "****" means keep current, empty means clear
    if data.smtp_password == "****":
        pass  # keep existing
    elif data.smtp_password:
        settings.SMTP_PASSWORD = data.smtp_password
    else:
        settings.SMTP_PASSWORD = None
    # If username is cleared, also clear password
    if not data.smtp_username:
        settings.SMTP_PASSWORD = None
    settings.SMTP_FROM = data.smtp_from
    settings.SMTP_USE_TLS = data.smtp_use_tls

    env_path = "/app/.env"
    env_updates: dict[str, str] = {
        "SMTP_HOST": data.smtp_host,
        "SMTP_PORT": str(data.smtp_port),
        "SMTP_USERNAME": data.smtp_username or "",
        "SMTP_PASSWORD": settings.SMTP_PASSWORD or "",
        "SMTP_FROM": data.smtp_from,
        "SMTP_USE_TLS": str(data.smtp_use_tls).lower(),
    }

    _update_env(env_path, env_updates)

    return SmtpSettings(
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        smtp_username=settings.SMTP_USERNAME or "",
        smtp_password="****" if settings.SMTP_PASSWORD else "",
        smtp_from=settings.SMTP_FROM,
        smtp_use_tls=settings.SMTP_USE_TLS,
    )


@router.post("/email/test", response_model=SmtpTestResponse)
async def test_email(
    data: SmtpTestRequest,
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    try:
        msg = MIMEText(
            "This is a test email from NetMon.\n\n"
            "If you received this message, your SMTP settings are configured correctly.",
        )
        msg["Subject"] = "NetMon - Test Email"
        msg["From"] = settings.SMTP_FROM
        msg["To"] = data.to

        if settings.SMTP_USE_TLS:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)

        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

        server.sendmail(settings.SMTP_FROM, [data.to], msg.as_string())
        server.quit()
        return SmtpTestResponse(success=True, message="Test email sent successfully")
    except Exception as exc:
        logger.warning("SMTP test failed: %s", exc)
        return SmtpTestResponse(success=False, message="Failed to send test email. Check SMTP settings and server logs.")


class DhcpSettings(BaseModel):
    dhcp_enabled: bool
    dhcp_servers: str  # comma-separated list of DHCP server IPs/hostnames
    dhcp_username: str
    dhcp_password: Optional[str] = None  # write-only; GET returns masked
    dhcp_use_ssl: bool
    dhcp_auth: str = "negotiate"
    dhcp_sync_interval: int


class DhcpSyncResponse(BaseModel):
    success: bool
    message: str
    synced: int = 0
    total_leases: int = 0


@router.get("/dhcp", response_model=DhcpSettings)
async def get_dhcp_settings(
    _user: User = Depends(get_current_user),
):
    return DhcpSettings(
        dhcp_enabled=settings.DHCP_ENABLED,
        dhcp_servers=settings.DHCP_SERVERS,
        dhcp_username=settings.DHCP_USERNAME,
        dhcp_password="****" if settings.DHCP_PASSWORD else "",
        dhcp_use_ssl=settings.DHCP_USE_SSL,
        dhcp_auth=settings.DHCP_AUTH,
        dhcp_sync_interval=settings.DHCP_SYNC_INTERVAL,
    )


@router.put("/dhcp", response_model=DhcpSettings)
async def update_dhcp_settings(
    data: DhcpSettings,
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    settings.DHCP_ENABLED = data.dhcp_enabled
    settings.DHCP_SERVERS = data.dhcp_servers
    settings.DHCP_USERNAME = data.dhcp_username
    if data.dhcp_password == "****":
        pass  # keep existing
    elif data.dhcp_password:
        settings.DHCP_PASSWORD = data.dhcp_password
    else:
        settings.DHCP_PASSWORD = ""
    if not data.dhcp_username:
        settings.DHCP_PASSWORD = ""
    settings.DHCP_USE_SSL = data.dhcp_use_ssl
    settings.DHCP_AUTH = data.dhcp_auth
    settings.DHCP_SYNC_INTERVAL = data.dhcp_sync_interval

    env_path = "/app/.env"
    _update_env(env_path, {
        "DHCP_ENABLED": str(data.dhcp_enabled).lower(),
        "DHCP_SERVERS": data.dhcp_servers,
        "DHCP_USERNAME": data.dhcp_username,
        "DHCP_PASSWORD": settings.DHCP_PASSWORD,
        "DHCP_USE_SSL": str(data.dhcp_use_ssl).lower(),
        "DHCP_AUTH": data.dhcp_auth,
        "DHCP_SYNC_INTERVAL": str(data.dhcp_sync_interval),
    })

    return DhcpSettings(
        dhcp_enabled=settings.DHCP_ENABLED,
        dhcp_servers=settings.DHCP_SERVERS,
        dhcp_username=settings.DHCP_USERNAME,
        dhcp_password="****" if settings.DHCP_PASSWORD else "",
        dhcp_use_ssl=settings.DHCP_USE_SSL,
        dhcp_auth=settings.DHCP_AUTH,
        dhcp_sync_interval=settings.DHCP_SYNC_INTERVAL,
    )


@router.post("/dhcp/sync", response_model=DhcpSyncResponse)
async def trigger_dhcp_sync(
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Trigger an immediate DHCP name sync."""
    if not settings.DHCP_ENABLED:
        return DhcpSyncResponse(
            success=False, message="DHCP sync is not enabled"
        )
    if not settings.DHCP_SERVERS or not settings.DHCP_USERNAME:
        return DhcpSyncResponse(
            success=False, message="DHCP server not fully configured"
        )
    try:
        from app.tasks.dhcp_sync import sync_dhcp_names
        result = await asyncio.to_thread(sync_dhcp_names)
        return DhcpSyncResponse(
            success=True,
            message=f"Synced {result.get('synced', 0)} device names from {result.get('total_leases', 0)} DHCP leases",
            synced=result.get("synced", 0),
            total_leases=result.get("total_leases", 0),
        )
    except Exception as exc:
        logger.exception("DHCP sync failed")
        return DhcpSyncResponse(
            success=False, message=f"DHCP sync failed: {str(exc)}"
        )


class CsvImportResponse(BaseModel):
    success: bool
    message: str
    updated: int = 0
    skipped: int = 0


@router.post("/dhcp/import-csv", response_model=CsvImportResponse)
async def import_names_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Import device names from a CSV file. Expected columns: IP (or IPAddress) and Hostname (or HostName/Name)."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return CsvImportResponse(success=False, message="Please upload a .csv file")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handles BOM from Windows exports
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return CsvImportResponse(success=False, message="CSV has no headers")

    # Detect column names (flexible matching)
    fields_lower = {f.lower().strip(): f for f in reader.fieldnames}
    ip_col = None
    name_col = None
    for candidate in ("ip", "ipaddress", "ip_address", "ip address"):
        if candidate in fields_lower:
            ip_col = fields_lower[candidate]
            break
    for candidate in ("hostname", "host_name", "name", "hostName", "host name"):
        if candidate in fields_lower:
            name_col = fields_lower[candidate]
            break

    if not ip_col or not name_col:
        return CsvImportResponse(
            success=False,
            message=f"CSV must have IP and Hostname columns. Found: {', '.join(reader.fieldnames)}",
        )

    # Build IP -> name map
    name_map: dict[str, str] = {}
    for row in reader:
        ip = (row.get(ip_col) or "").strip()
        name = (row.get(name_col) or "").strip()
        if ip and name and name != ip:
            name_map[ip] = name

    if not name_map:
        return CsvImportResponse(success=False, message="No valid IP/hostname pairs found in CSV")

    # Update devices whose name is still their IP
    devices = (await db.execute(select(Device))).scalars().all()
    updated = 0
    skipped = 0
    for device in devices:
        if device.ip_address in name_map:
            if device.name == device.ip_address:
                device.name = name_map[device.ip_address]
                updated += 1
            else:
                skipped += 1

    await db.flush()
    return CsvImportResponse(
        success=True,
        message=f"Updated {updated} device names ({skipped} already named)",
        updated=updated,
        skipped=skipped,
    )


GITHUB_REPO = "WestsideCoder/NetMon"
_update_cache: dict[str, object] = {}


class VersionInfo(BaseModel):
    current_version: str
    latest_version: str | None = None
    update_available: bool = False
    release_url: str | None = None
    error: str | None = None


@router.get("/version", response_model=VersionInfo)
async def check_version(
    force: bool = False,
    _user: User = Depends(get_current_user),
):
    """Check current version and compare against latest GitHub release."""
    import time
    import httpx

    current = settings.VERSION
    cache_key = "version_check"
    if not force:
        cached = _update_cache.get(cache_key)
        if cached:
            ts, info = cached
            if time.time() - ts < 86400:  # 24h cache
                return info

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
                headers={"Accept": "application/vnd.github.v3+json"},
            )
        if resp.status_code == 200:
            data = resp.json()
            tag = data.get("tag_name", "").lstrip("v")
            html_url = data.get("html_url", "")
            info = VersionInfo(
                current_version=current,
                latest_version=tag,
                update_available=tag != current and tag > current,
                release_url=html_url,
            )
        elif resp.status_code == 404:
            info = VersionInfo(
                current_version=current,
                latest_version=None,
                error="No releases published yet",
            )
        else:
            info = VersionInfo(
                current_version=current,
                error=f"GitHub API returned {resp.status_code}",
            )
    except Exception as exc:
        logger.warning("Version check failed: %s", exc)
        info = VersionInfo(
            current_version=current,
            error="Could not reach GitHub",
        )

    _update_cache[cache_key] = (time.time(), info)
    return info


def _update_env(path: str, updates: dict[str, str]) -> None:
    """Update key=value pairs in an .env file."""
    lines = []
    found_keys = set()
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                key = line.split("=", 1)[0].strip()
                if key in updates:
                    lines.append(f"{key}={updates[key]}\n")
                    found_keys.add(key)
                else:
                    lines.append(line)
    for key, val in updates.items():
        if key not in found_keys:
            lines.append(f"{key}={val}\n")
    with open(path, "w") as f:
        f.writelines(lines)
