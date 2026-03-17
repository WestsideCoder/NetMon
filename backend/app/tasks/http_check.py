# SPDX-License-Identifier: GPL-3.0-or-later
"""
HTTP/HTTPS endpoint checking task.
"""
import logging
import ssl
import time
from datetime import datetime

import httpx
from sqlalchemy import select

from app.tasks import celery_app
from app.database import SyncSessionLocal
from app.models.device import Device, DeviceStatus

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.http_check.check_http_endpoints")
def check_http_endpoints():
    """Check all devices with HTTP URLs configured."""
    db = SyncSessionLocal()
    try:
        devices = db.execute(
            select(Device).where(
                Device.http_url.isnot(None),
                Device.maintenance_mode == False,  # noqa: E712
            )
        ).scalars().all()

        checked = 0
        for device in devices:
            try:
                _check_device_url(db, device)
                checked += 1
            except Exception:
                logger.exception("HTTP check failed for %s", device.name)

        db.commit()
        logger.info("HTTP checked %d devices", checked)
        return {"checked": checked}
    except Exception:
        db.rollback()
        logger.exception("HTTP check task failed")
        raise
    finally:
        db.close()


def _check_device_url(db, device: Device) -> None:
    """Check a single device's HTTP URL."""
    url = device.http_url
    if not url:
        return

    start = time.monotonic()
    try:
        with httpx.Client(timeout=10, verify=False, follow_redirects=True) as client:
            resp = client.get(url)
        elapsed = (time.monotonic() - start) * 1000  # ms
        device.http_response_time = round(elapsed, 2)

        expected = device.http_expected_status or 200
        if resp.status_code != expected:
            logger.warning(
                "HTTP check %s: expected %d got %d",
                device.name, expected, resp.status_code,
            )
            if device.status == DeviceStatus.ONLINE:
                device.status = DeviceStatus.WARNING
                device.status_reason = f"HTTP {resp.status_code}"
                from app.services.alert_service import notify_status_change
                from app.models.alert import AlertSeverity
                notify_status_change(db, device, AlertSeverity.WARNING, f"HTTP {resp.status_code}", metric_name="http_check")

        # Check SSL cert expiry for HTTPS URLs
        if url.startswith("https://"):
            _check_cert_expiry(device, url)

    except httpx.RequestError as e:
        device.http_response_time = None
        logger.warning("HTTP check failed for %s: %s", device.name, e)
        if device.status == DeviceStatus.ONLINE:
            device.status = DeviceStatus.WARNING
            device.status_reason = "HTTP"
            from app.services.alert_service import notify_status_change
            from app.models.alert import AlertSeverity
            notify_status_change(db, device, AlertSeverity.WARNING, "HTTP unreachable", metric_name="http_check")


def _check_cert_expiry(device: Device, url: str) -> None:
    """Check SSL certificate expiry date."""
    try:
        import socket
        hostname = url.split("://")[1].split("/")[0].split(":")[0]
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=hostname) as s:
            s.settimeout(5)
            s.connect((hostname, 443))
            cert = s.getpeercert()
        if cert:
            expiry_str = cert.get("notAfter", "")
            if expiry_str:
                expiry = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z")
                device.https_cert_expiry = expiry
    except Exception:
        pass
