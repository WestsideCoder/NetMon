# SPDX-License-Identifier: GPL-3.0-or-later
"""
DHCP sync task — queries Windows DHCP Server via PowerShell remoting (WinRM)
to pull lease-to-hostname mappings, then updates device names in NetMon.
"""
import logging
from datetime import datetime

from sqlalchemy import select

from app.tasks import celery_app
from app.database import SyncSessionLocal
from app.models.device import Device
from app.config import settings

logger = logging.getLogger(__name__)


def _query_dhcp_leases(server: str, username: str, password: str, use_ssl: bool) -> list[dict]:
    """Connect to Windows DHCP Server via WinRM and fetch all leases."""
    from pypsrp.client import Client

    # PowerShell script: get all scopes, then all leases with hostnames
    ps_script = """
    $leases = @()
    $scopes = Get-DhcpServerv4Scope -ErrorAction SilentlyContinue
    foreach ($scope in $scopes) {
        $scopeLeases = Get-DhcpServerv4Lease -ScopeId $scope.ScopeId -ErrorAction SilentlyContinue
        foreach ($l in $scopeLeases) {
            if ($l.HostName -and $l.IPAddress) {
                $leases += [PSCustomObject]@{
                    IP = $l.IPAddress.ToString()
                    Hostname = $l.HostName
                    MAC = $l.ClientId
                    State = $l.AddressState
                }
            }
        }
    }
    $leases | ConvertTo-Json -Compress
    """

    ssl_port = 5986 if use_ssl else 5985
    client = Client(
        server,
        username=username,
        password=password,
        ssl=use_ssl,
        port=ssl_port,
        cert_validation=False,
    )

    output, streams, had_errors = client.execute_ps(ps_script)

    if had_errors:
        error_text = "\n".join(str(e) for e in streams.error) if streams.error else "Unknown error"
        logger.error("DHCP PowerShell errors: %s", error_text)

    if not output or not output.strip():
        return []

    import json
    try:
        data = json.loads(output.strip())
    except json.JSONDecodeError:
        logger.error("Failed to parse DHCP lease JSON: %s", output[:500])
        return []

    # Single object vs array
    if isinstance(data, dict):
        data = [data]

    return data


@celery_app.task(name="app.tasks.dhcp_sync.sync_dhcp_names")
def sync_dhcp_names():
    """Celery task: sync device names from Windows DHCP Server leases."""
    if not settings.DHCP_ENABLED:
        return {"synced": 0, "skipped": "DHCP sync disabled"}

    if not settings.DHCP_SERVER or not settings.DHCP_USERNAME:
        return {"synced": 0, "skipped": "DHCP server not configured"}

    db = SyncSessionLocal()
    try:
        # Fetch all leases from DHCP
        leases = _query_dhcp_leases(
            server=settings.DHCP_SERVER,
            username=settings.DHCP_USERNAME,
            password=settings.DHCP_PASSWORD,
            use_ssl=settings.DHCP_USE_SSL,
        )
        logger.info("DHCP sync: fetched %d leases", len(leases))

        if not leases:
            return {"synced": 0, "total_leases": 0}

        # Build IP -> hostname map from DHCP leases
        dhcp_names: dict[str, str] = {}
        for lease in leases:
            ip = lease.get("IP", "")
            hostname = lease.get("Hostname", "")
            if ip and hostname:
                # Windows DHCP sometimes returns FQDN — strip domain if present
                clean_name = hostname.split(".")[0] if "." in hostname else hostname
                # Skip if hostname is just the IP
                if clean_name and clean_name != ip:
                    dhcp_names[ip] = clean_name

        # Get all devices whose name is still their IP address
        devices = db.execute(select(Device)).scalars().all()

        updated = 0
        for device in devices:
            # Only update if device name is its IP or looks auto-generated
            if device.ip_address in dhcp_names:
                current_name = device.name.strip()
                new_name = dhcp_names[device.ip_address]
                # Update if name is still the IP address
                if current_name == device.ip_address:
                    device.name = new_name
                    updated += 1
                    logger.info(
                        "DHCP sync: %s -> %s",
                        device.ip_address, new_name,
                    )

        if updated:
            db.commit()
        logger.info("DHCP sync complete: %d devices updated from %d leases", updated, len(leases))
        return {"synced": updated, "total_leases": len(leases)}
    except Exception:
        db.rollback()
        logger.exception("DHCP sync task failed")
        raise
    finally:
        db.close()
