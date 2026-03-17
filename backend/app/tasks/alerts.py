# SPDX-License-Identifier: GPL-3.0-or-later
"""
Alert processing and notification tasks.
"""
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select

from sqlalchemy.orm import joinedload

from app.tasks import celery_app
from app.database import SyncSessionLocal
from app.models.device import Device
from app.models.snmp import SNMPData
from app.models.alert import Alert, AlertStatus, AlertRule, EscalationPolicy, NotificationChannel
from app.services.alert_service import evaluate_thresholds

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.alerts.process_alerts")
def process_alerts():
    """Evaluate alert rules against recent metrics for all devices."""
    db = SyncSessionLocal()
    try:
        devices = db.execute(
            select(Device).where(Device.maintenance_mode == False)  # noqa: E712
        ).scalars().all()

        new_alert_count = 0
        all_new_alerts = []
        for device in devices:
            metrics = _collect_device_metrics(device, db)
            if metrics:
                new_alerts = evaluate_thresholds(db, device, metrics)
                all_new_alerts.extend(new_alerts)
                new_alert_count += len(new_alerts)

        db.commit()

        # Send notifications for new alerts
        if all_new_alerts:
            from app.services.alert_service import _dispatch_notification
            channels = db.execute(
                select(NotificationChannel).where(NotificationChannel.enabled == True)  # noqa: E712
            ).scalars().all()
            for alert in all_new_alerts:
                for channel in channels:
                    try:
                        _dispatch_notification(alert, channel)
                    except Exception:
                        logger.exception("Failed to notify channel %s for alert %d", channel.name, alert.id)
            db.commit()
            logger.info("Created %d new alerts, notified %d channels", new_alert_count, len(channels))

        return {"new_alerts": new_alert_count}
    except Exception:
        db.rollback()
        logger.exception("Alert processing failed")
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.alerts.check_escalations")
def check_escalations():
    """Escalate unacknowledged alerts past their escalation delay."""
    db = SyncSessionLocal()
    try:
        policies = db.execute(
            select(EscalationPolicy).where(EscalationPolicy.enabled == True)  # noqa: E712
        ).scalars().all()

        escalated = 0
        for policy in policies:
            cutoff = datetime.utcnow() - timedelta(minutes=policy.delay_minutes)
            alerts = db.execute(
                select(Alert).where(
                    Alert.status == AlertStatus.ACTIVE,
                    Alert.triggered_at <= cutoff,
                    Alert.severity == policy.min_severity,
                )
            ).scalars().all()

            for alert in alerts:
                channel = db.get(NotificationChannel, policy.channel_id)
                if channel:
                    _send_notification(alert, channel)
                    escalated += 1

        db.commit()
        return {"escalated": escalated}
    except Exception:
        db.rollback()
        logger.exception("Escalation check failed")
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.alerts.send_notification")
def send_notification_task(alert_id: int, channel_id: int):
    """Send notification for a specific alert via a specific channel."""
    db = SyncSessionLocal()
    try:
        alert = db.get(Alert, alert_id)
        channel = db.get(NotificationChannel, channel_id)
        if alert and channel:
            _send_notification(alert, channel)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Notification send failed")
    finally:
        db.close()


def _collect_device_metrics(device: Device, db=None) -> dict[str, float]:
    """Build metrics dict from device state and latest SNMP data for alert evaluation."""
    metrics = {}
    if device.response_time is not None:
        metrics["response_time"] = device.response_time
    metrics["consecutive_failures"] = float(device.consecutive_failures)
    if device.http_response_time is not None:
        metrics["http_response_time"] = device.http_response_time
    if device.uptime_percentage is not None:
        metrics["uptime_percentage"] = device.uptime_percentage

    # NTP metrics
    if device.ntp_enabled:
        if device.ntp_stratum is not None:
            metrics["ntp_stratum"] = float(device.ntp_stratum)
        if device.ntp_offset_ms is not None:
            metrics["ntp_offset_abs_ms"] = abs(device.ntp_offset_ms)
        metrics["ntp_consecutive_failures"] = float(device.ntp_consecutive_failures)

    # Include latest SNMP metrics for alert evaluation
    dtype = device.device_type.value if device.device_type else None
    if db and device.snmp_enabled:
        snmp_metric_names = []
        if dtype == "ups":
            snmp_metric_names = [
                "upsBasicBatteryStatus", "upsBatteryStatus",
                "upsAdvBatteryCapacity", "upsEstimatedChargeRemaining",
                "upsBasicOutputStatus", "upsOutputSource",
            ]
        # Server/network device metrics (CPU, memory, disk from HOST-RESOURCES-MIB)
        if dtype in ("server", "router", "switch", "access_point", None):
            snmp_metric_names += [
                "cpuLoadAvg", "memoryUsedPercent", "diskUsedPercent",
                # Cisco-specific
                "cpuBusyPer5min", "ciscoMemoryUsedPercent",
                "ciscoEnvMonTemperatureValue",
            ]
        for metric_name in snmp_metric_names:
            row = db.execute(
                select(SNMPData)
                .where(SNMPData.device_id == device.id, SNMPData.oid_name == metric_name)
                .order_by(SNMPData.timestamp.desc())
                .limit(1)
            ).scalar_one_or_none()
            if row:
                try:
                    metrics[metric_name] = float(row.value)
                except (ValueError, TypeError):
                    pass

        # Cross-check: if UPS reports on-battery but input voltage is normal,
        # override the output status metric so alert rules don't false-trigger
        if dtype == "ups":
            output_status = metrics.get("upsBasicOutputStatus")
            output_source = metrics.get("upsOutputSource")
            if output_status == 3.0 or output_source == 5.0:
                voltage_row = db.execute(
                    select(SNMPData)
                    .where(SNMPData.device_id == device.id, SNMPData.oid_name == "upsAdvInputLineVoltage")
                    .order_by(SNMPData.timestamp.desc())
                    .limit(1)
                ).scalar_one_or_none()
                if voltage_row:
                    try:
                        input_voltage = float(voltage_row.value)
                        if input_voltage > 90:
                            # Mains power present — override false on-battery status
                            if output_status == 3.0:
                                metrics["upsBasicOutputStatus"] = 2.0  # onLine
                            if output_source == 5.0:
                                metrics["upsOutputSource"] = 3.0  # normal
                    except (ValueError, TypeError):
                        pass

    return metrics


def _send_notification(alert: Alert, channel: NotificationChannel) -> None:
    """Dispatch notification to the appropriate channel type."""
    try:
        config = json.loads(channel.config) if channel.config else {}
    except json.JSONDecodeError:
        config = {}

    if channel.channel_type == "email":
        _send_email(alert, config)
        alert.email_sent = True
    elif channel.channel_type in ("webhook", "slack"):
        _send_webhook(alert, config)
        alert.webhook_sent = True
    else:
        logger.warning("Unknown channel type: %s", channel.channel_type)


def _send_email(alert: Alert, config: dict) -> None:
    """Send email notification (synchronous wrapper)."""
    try:
        import smtplib
        from email.mime.text import MIMEText
        from app.config import settings

        to_addr = config.get("to", settings.SMTP_FROM)
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
            logger.info("Email sent for alert %d", alert.id)
        else:
            logger.warning("SMTP not configured, skipping email for alert %d", alert.id)
    except Exception:
        logger.exception("Failed to send email for alert %d", alert.id)


def _send_webhook(alert: Alert, config: dict) -> None:
    """Send webhook notification."""
    try:
        import httpx
        url = config.get("url")
        if not url:
            return
        payload = {
            "text": f"[{alert.severity.value.upper()}] {alert.title}",
            "alert_id": alert.id,
            "severity": alert.severity.value,
            "message": alert.message,
            "triggered_at": alert.triggered_at.isoformat(),
        }
        with httpx.Client(timeout=10) as client:
            client.post(url, json=payload)
        logger.info("Webhook sent for alert %d", alert.id)
    except Exception:
        logger.exception("Failed to send webhook for alert %d", alert.id)
