# SPDX-License-Identifier: GPL-3.0-or-later
"""
Celery app configuration and beat schedule.
"""
from celery import Celery
from app.config import settings

celery_app = Celery(
    "netmon",
    broker=str(settings.REDIS_URL),
    backend=str(settings.REDIS_URL),
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    beat_schedule={
        "ping-all-devices": {
            "task": "app.tasks.ping.ping_all_devices",
            "schedule": float(settings.PING_INTERVAL),
        },
        "snmp-poll-all-devices": {
            "task": "app.tasks.snmp_poll.snmp_poll_all_devices",
            "schedule": float(settings.SNMP_POLL_INTERVAL),
        },
        "http-check-all-devices": {
            "task": "app.tasks.http_check.check_http_endpoints",
            "schedule": float(settings.HTTP_CHECK_INTERVAL),
        },
        "process-alerts": {
            "task": "app.tasks.alerts.process_alerts",
            "schedule": 60.0,
        },
        "check-escalations": {
            "task": "app.tasks.alerts.check_escalations",
            "schedule": 300.0,
        },
        "ntp-poll-all-devices": {
            "task": "app.tasks.ntp_poll.ntp_poll_all_devices",
            "schedule": float(settings.NTP_POLL_INTERVAL),
        },
        "dhcp-sync-names": {
            "task": "app.tasks.dhcp_sync.sync_dhcp_names",
            "schedule": float(settings.DHCP_SYNC_INTERVAL),
        },
    },
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])

# Explicitly import task modules so the worker registers them
from app.tasks import ping, snmp_poll, http_check, alerts, ntp_poll, dhcp_sync  # noqa: F401, E402
