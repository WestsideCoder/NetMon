# SPDX-License-Identifier: GPL-3.0-or-later
"""
Email notification channel using aiosmtplib.
"""
import logging
from email.mime.text import MIMEText

import aiosmtplib
from jinja2 import Template

from app.config import settings
from app.models.alert import Alert
from app.services.notifications.base import BaseNotificationChannel

logger = logging.getLogger(__name__)

ALERT_TEMPLATE = Template("""
NetMon Alert - {{ alert.severity.value | upper }}

Device: {{ alert.device_id }}
Title: {{ alert.title }}
Message: {{ alert.message }}

{% if alert.metric_name %}Metric: {{ alert.metric_name }} = {{ alert.metric_value }}{% endif %}

Triggered at: {{ alert.triggered_at }}

---
NetMon (Beta) v0.9 - Network Monitoring System
""")


class EmailChannel(BaseNotificationChannel):
    async def send(self, alert: Alert) -> bool:
        to_addr = self.config.get("to", str(settings.SMTP_FROM))
        body = ALERT_TEMPLATE.render(alert=alert)

        msg = MIMEText(body)
        msg["Subject"] = f"[NetMon] {alert.severity.value.upper()}: {alert.title}"
        msg["From"] = str(settings.SMTP_FROM)
        msg["To"] = to_addr

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USERNAME,
                password=settings.SMTP_PASSWORD,
                use_tls=settings.SMTP_USE_TLS,
            )
            logger.info("Email sent for alert %d to %s", alert.id, to_addr)
            return True
        except Exception:
            logger.exception("Failed to send email for alert %d", alert.id)
            return False
