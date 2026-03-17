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

    new_alerts = []
    for rule in rules:
        if rule.device_type and device.device_type and rule.device_type != device.device_type.value:
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
                alert = Alert(
                    device_id=device.id,
                    rule_id=rule.id,
                    severity=rule.severity,
                    status=AlertStatus.ACTIVE,
                    title=f"{rule.name}: {rule.metric_name} {rule.condition} {rule.threshold}",
                    message=f"Device {device.name} ({device.ip_address}): "
                            f"{rule.metric_name}={value} {rule.condition} {rule.threshold}",
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
    now = datetime.utcnow()

    # Check for duplicate active alert with same metric_name
    existing = db.execute(
        select(func.count(Alert.id)).where(
            Alert.device_id == device.id,
            Alert.metric_name == metric_name,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
    ).scalar() or 0

    alert = Alert(
        device_id=device.id,
        severity=severity,
        status=AlertStatus.ACTIVE,
        title=f"{device.name}: {reason}",
        message=f"Device {device.name} ({device.ip_address}) — {reason}",
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


def _send_email_notification(alert: Alert, config: dict) -> None:
    """Send email notification."""
    import smtplib
    from email.mime.text import MIMEText
    from app.config import settings

    to_addr = config.get("to", str(settings.SMTP_FROM))
    msg = MIMEText(
        f"Alert: {alert.title}\n\n{alert.message}\n\n"
        f"Severity: {alert.severity.value}\n"
        f"Triggered: {alert.triggered_at}"
    )
    msg["Subject"] = f"[NetMon] {alert.severity.value.upper()}: {alert.title}"
    msg["From"] = str(settings.SMTP_FROM)
    msg["To"] = to_addr

    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Email sent for alert: %s to %s", alert.title, to_addr)
    else:
        logger.warning("SMTP not configured, skipping email for: %s", alert.title)


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
