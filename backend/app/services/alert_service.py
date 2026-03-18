# SPDX-License-Identifier: GPL-3.0-or-later
"""
Alert evaluation, state machine, deduplication, and notifications.
"""
import json
import logging
import operator
from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertRule, AlertStatus, AlertSeverity, NotificationChannel
from app.models.device import Device, DeviceStatus

logger = logging.getLogger(__name__)

CONDITION_OPS = {
    "gt": operator.gt,
    "lt": operator.lt,
    "eq": operator.eq,
    "ne": operator.ne,
    "gte": operator.ge,
    "lte": operator.le,
}


def evaluate_thresholds(
    db: Session, device: Device, metrics: dict[str, float]
) -> List[Alert]:
    """Check metrics against all enabled alert rules. Returns new alerts."""
    rules = db.execute(
        select(AlertRule).where(AlertRule.enabled == True)  # noqa: E712
    ).scalars().all()

    # Parse per-device excluded metrics
    excluded = set()
    if device.alert_excluded_metrics:
        try:
            excluded = set(json.loads(device.alert_excluded_metrics))
        except (json.JSONDecodeError, TypeError):
            pass

    new_alerts = []
    for rule in rules:
        if rule.device_type and device.device_type and rule.device_type != device.device_type.value:
            continue
        # Skip metrics excluded for this device
        if rule.metric_name in excluded:
            _auto_resolve_by_rule(db, device.id, rule.id)
            continue
        value = metrics.get(rule.metric_name)
        if value is None:
            # Metric not collected — auto-resolve any stale alerts for this rule
            _auto_resolve_by_rule(db, device.id, rule.id)
            continue
        op = CONDITION_OPS.get(rule.condition)
        if op is None:
            continue
        if op(value, rule.threshold):
            if not _is_duplicate(db, device.id, rule.id):
                info = _device_details(device)
                alert = Alert(
                    device_id=device.id,
                    rule_id=rule.id,
                    severity=rule.severity,
                    status=AlertStatus.ACTIVE,
                    title=f"{rule.name}: {rule.metric_name} {rule.condition} {rule.threshold}",
                    message=(
                        f"Device: {device.name}\n"
                        f"IP Address: {device.ip_address}\n"
                        f"Type: {info['type']}\n"
                        f"Site: {info['site']}\n"
                        f"Metric: {rule.metric_name}={value} {rule.condition} {rule.threshold}"
                    ),
                    metric_name=rule.metric_name,
                    metric_value=str(value),
                )
                db.add(alert)
                new_alerts.append(alert)
        else:
            # Condition no longer true — auto-resolve any active alerts for this rule+device
            _auto_resolve_by_rule(db, device.id, rule.id)
    if new_alerts:
        # Set device status based on worst new alert severity
        worst = max(new_alerts, key=lambda a: (0 if a.severity == AlertSeverity.INFO else 1 if a.severity == AlertSeverity.WARNING else 2))
        if worst.severity == AlertSeverity.CRITICAL:
            device.status = DeviceStatus.OFFLINE
            device.status_reason = worst.title
        elif worst.severity == AlertSeverity.WARNING:
            if device.status == DeviceStatus.ONLINE:
                device.status = DeviceStatus.WARNING
                device.status_reason = worst.title
        db.flush()
    return new_alerts


def _is_duplicate(db: Session, device_id: int, rule_id: int) -> bool:
    """Check if there's already an active/acknowledged alert for this device+rule."""
    result = db.execute(
        select(func.count(Alert.id)).where(
            Alert.device_id == device_id,
            Alert.rule_id == rule_id,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
    )
    return (result.scalar() or 0) > 0


def acknowledge_alert(db: Session, alert_id: int, user_id: int) -> Optional[Alert]:
    alert = db.get(Alert, alert_id)
    if not alert or alert.status != AlertStatus.ACTIVE:
        return None
    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = user_id
    db.flush()

    # If no remaining active (non-acknowledged) alerts, clear device to green
    remaining = db.execute(
        select(func.count(Alert.id)).where(
            Alert.device_id == alert.device_id,
            Alert.status == AlertStatus.ACTIVE,
        )
    ).scalar() or 0
    if remaining == 0:
        device = db.get(Device, alert.device_id)
        if device:
            device.status = DeviceStatus.ONLINE
            device.status_reason = None
            db.flush()

    return alert


def resolve_alert(db: Session, alert_id: int) -> Optional[Alert]:
    alert = db.get(Alert, alert_id)
    if not alert or alert.status == AlertStatus.RESOLVED:
        return None
    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = datetime.utcnow()
    db.flush()
    return alert


def auto_resolve_alerts(db: Session, device_id: int, metric_name: str) -> None:
    """Auto-resolve alerts when metric returns to normal."""
    alerts = db.execute(
        select(Alert).where(
            Alert.device_id == device_id,
            Alert.metric_name == metric_name,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
    ).scalars().all()
    for alert in alerts:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.utcnow()
    if alerts:
        db.flush()
        _maybe_clear_device_status(db, device_id)


def _auto_resolve_by_rule(db: Session, device_id: int, rule_id: int) -> None:
    """Auto-resolve alerts for a specific rule+device when condition clears."""
    alerts = db.execute(
        select(Alert).where(
            Alert.device_id == device_id,
            Alert.rule_id == rule_id,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
    ).scalars().all()
    for alert in alerts:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.utcnow()
    if alerts:
        db.flush()
        _maybe_clear_device_status(db, device_id)


def _maybe_clear_device_status(db: Session, device_id: int) -> None:
    """Clear device to ONLINE if no active alerts remain."""
    remaining = db.execute(
        select(func.count(Alert.id)).where(
            Alert.device_id == device_id,
            Alert.status == AlertStatus.ACTIVE,
        )
    ).scalar() or 0
    if remaining == 0:
        device = db.get(Device, device_id)
        if device and device.status != DeviceStatus.OFFLINE:
            device.status = DeviceStatus.ONLINE
            device.status_reason = None
            db.flush()


def _sanitize_header(value: str) -> str:
    """Remove newlines and control chars to prevent email header injection."""
    return value.replace("\r", "").replace("\n", "").strip()[:200]


def _device_details(device: Device) -> dict:
    """Extract device details for email content."""
    site_name = ""
    try:
        if device.site:
            site_name = device.site.name
    except Exception:
        pass
    dev_type = device.device_type.value if device.device_type else "unknown"
    return {"site": site_name, "type": dev_type}


def notify_status_change(
    db: Session,
    device: Device,
    severity: AlertSeverity,
    reason: str,
    metric_name: str = "status_change",
) -> None:
    """Create an alert and immediately send notifications for a status change.

    Called by ping, SNMP, and HTTP tasks when a device degrades to WARNING or OFFLINE.
    Deduplicates by metric_name so repeated failures don't spam notifications.
    """
    # Never create alerts for devices in maintenance mode
    if device.maintenance_mode:
        return

    now = datetime.utcnow()

    # Check for duplicate active alert with same metric_name
    existing = db.execute(
        select(func.count(Alert.id)).where(
            Alert.device_id == device.id,
            Alert.metric_name == metric_name,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
    ).scalar() or 0

    info = _device_details(device)
    from app.config import Settings
    fresh = Settings()
    template_vars = {
        "device": device.name, "ip": device.ip_address,
        "type": info["type"], "site": info["site"],
        "reason": reason, "severity": severity.value.upper(),
        "time": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    body = fresh.EMAIL_TEMPLATE_DOWN.format(**template_vars) if fresh.EMAIL_TEMPLATE_DOWN else (
        f"Device: {device.name}\nIP Address: {device.ip_address}\n"
        f"Type: {info['type']}\nSite: {info['site']}\nReason: {reason}"
    )
    alert = Alert(
        device_id=device.id,
        severity=severity,
        status=AlertStatus.ACTIVE,
        title=f"{device.name}: {reason}",
        message=body,
        metric_name=metric_name,
        metric_value=reason,
        triggered_at=now,
    )

    if existing == 0:
        db.add(alert)
        db.flush()

    # Send notifications to all enabled channels
    channels = db.execute(
        select(NotificationChannel).where(NotificationChannel.enabled == True)  # noqa: E712
    ).scalars().all()

    for channel in channels:
        try:
            _dispatch_notification(alert, channel)
        except Exception:
            logger.exception(
                "Failed to notify channel %s for device %s", channel.name, device.name
            )


def notify_recovery(
    db: Session,
    device: Device,
) -> None:
    """Send recovery notifications when a device comes back online after 3 consecutive successes."""
    channels = db.execute(
        select(NotificationChannel).where(NotificationChannel.enabled == True)  # noqa: E712
    ).scalars().all()

    for channel in channels:
        try:
            _dispatch_recovery(device, channel)
        except Exception:
            logger.exception(
                "Failed to send recovery notification via %s for device %s",
                channel.name, device.name,
            )


def _dispatch_recovery(device: Device, channel: NotificationChannel) -> None:
    """Send a recovery notification via the given channel."""
    try:
        config = json.loads(channel.config) if channel.config else {}
    except json.JSONDecodeError:
        config = {}

    if channel.channel_type == "email":
        _send_recovery_email(device, config)
    elif channel.channel_type in ("webhook", "slack"):
        import httpx
        url = config.get("url")
        if not url:
            return
        payload = {
            "text": f"[RECOVERED] {device.name} ({device.ip_address}) is back online",
            "severity": "info",
            "message": f"Device {device.name} ({device.ip_address}) has recovered and is back online.",
            "recovered_at": datetime.utcnow().isoformat(),
        }
        with httpx.Client(timeout=10) as client:
            client.post(url, json=payload)
        logger.info("Recovery webhook sent for device: %s", device.name)


def _send_recovery_email(device: Device, config: dict) -> None:
    """Send recovery email notification."""
    import smtplib
    from email.mime.text import MIMEText

    smtp = _load_smtp_settings()
    info = _device_details(device)
    from app.config import Settings
    fresh = Settings()
    now = datetime.utcnow()
    template_vars = {
        "device": device.name, "ip": device.ip_address,
        "type": info["type"], "site": info["site"],
        "recovery_pings": str(fresh.RECOVERY_PINGS),
        "time": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    body = fresh.EMAIL_TEMPLATE_UP.format(**template_vars) if fresh.EMAIL_TEMPLATE_UP else (
        f"Device {device.name} ({device.ip_address}) has recovered and is back online.\n"
        f"Type: {info['type']}\nSite: {info['site']}\n"
        f"Recovered after {fresh.RECOVERY_PINGS} consecutive successful pings.\n"
        f"Time: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}"
    )
    to_addr = config.get("to", smtp["from_addr"])
    msg = MIMEText(body)
    try:
        subject = fresh.EMAIL_SUBJECT_UP.format(**template_vars)
    except (KeyError, IndexError):
        subject = f"[NetMon] RECOVERED: {device.name} is back online"
    msg["Subject"] = _sanitize_header(subject)
    msg["From"] = _sanitize_header(smtp["from_addr"])
    msg["To"] = _sanitize_header(to_addr)

    if not smtp["host"]:
        logger.warning("SMTP not configured, skipping recovery email for: %s", device.name)
        return

    with smtplib.SMTP(smtp["host"], smtp["port"]) as server:
        if smtp["use_tls"]:
            server.starttls()
        if smtp["username"] and smtp["password"]:
            server.login(smtp["username"], smtp["password"])
        server.send_message(msg)
    logger.info("Recovery email sent for device: %s to %s", device.name, to_addr)


def _dispatch_notification(alert: Alert, channel: NotificationChannel) -> None:
    """Send a notification via the given channel (sync)."""
    try:
        config = json.loads(channel.config) if channel.config else {}
    except json.JSONDecodeError:
        config = {}

    if channel.channel_type == "email":
        _send_email_notification(alert, config)
        alert.email_sent = True
    elif channel.channel_type in ("webhook", "slack"):
        _send_webhook_notification(alert, config)
        alert.webhook_sent = True
    else:
        logger.warning("Unknown channel type: %s", channel.channel_type)


def _load_smtp_settings() -> dict:
    """Reload SMTP settings from .env so celery workers pick up changes."""
    from app.config import Settings
    fresh = Settings()
    return {
        "host": fresh.SMTP_HOST,
        "port": fresh.SMTP_PORT,
        "username": fresh.SMTP_USERNAME,
        "password": fresh.SMTP_PASSWORD,
        "from_addr": str(fresh.SMTP_FROM),
        "use_tls": fresh.SMTP_USE_TLS,
    }


def _send_email_notification(alert: Alert, config: dict) -> None:
    """Send email notification."""
    import smtplib
    from email.mime.text import MIMEText
    from app.config import Settings

    smtp = _load_smtp_settings()
    fresh = Settings()
    to_addr = config.get("to", smtp["from_addr"])
    msg = MIMEText(
        f"Alert: {alert.title}\n\n{alert.message}\n\n"
        f"Severity: {alert.severity.value}\n"
        f"Triggered: {alert.triggered_at}"
    )
    # Build subject from template
    subject_template = fresh.EMAIL_SUBJECT_DOWN
    try:
        # Extract device name from alert title (format: "device_name: reason")
        parts = alert.title.split(": ", 1)
        device_name = parts[0] if parts else alert.title
        reason = parts[1] if len(parts) > 1 else alert.metric_value or ""
        subject = subject_template.format(
            device=device_name, severity=alert.severity.value.upper(),
            reason=reason, ip="", type="", site="",
            time=alert.triggered_at.strftime("%Y-%m-%d %H:%M:%S UTC") if alert.triggered_at else "",
        )
    except (KeyError, IndexError):
        subject = f"[NetMon] {alert.severity.value.upper()}: {alert.title}"
    msg["Subject"] = _sanitize_header(subject)
    msg["From"] = _sanitize_header(smtp["from_addr"])
    msg["To"] = _sanitize_header(to_addr)

    if not smtp["host"]:
        logger.warning("SMTP not configured, skipping email for: %s", alert.title)
        return

    with smtplib.SMTP(smtp["host"], smtp["port"]) as server:
        if smtp["use_tls"]:
            server.starttls()
        if smtp["username"] and smtp["password"]:
            server.login(smtp["username"], smtp["password"])
        server.send_message(msg)
    logger.info("Email sent for alert: %s to %s", alert.title, to_addr)


def _send_webhook_notification(alert: Alert, config: dict) -> None:
    """Send webhook notification."""
    import httpx
    url = config.get("url")
    if not url:
        return
    payload = {
        "text": f"[{alert.severity.value.upper()}] {alert.title}",
        "severity": alert.severity.value,
        "message": alert.message,
        "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
    }
    with httpx.Client(timeout=10) as client:
        client.post(url, json=payload)
    logger.info("Webhook sent for alert: %s", alert.title)
