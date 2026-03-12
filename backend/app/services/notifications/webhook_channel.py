# SPDX-License-Identifier: GPL-3.0-or-later
"""
Webhook notification channel (supports Slack, Teams, Discord, generic).
"""
import logging

import httpx

from app.models.alert import Alert
from app.services.notifications.base import BaseNotificationChannel

logger = logging.getLogger(__name__)


class WebhookChannel(BaseNotificationChannel):
    async def send(self, alert: Alert) -> bool:
        url = self.config.get("url")
        if not url:
            logger.error("Webhook URL not configured")
            return False

        payload = {
            "text": f"[{alert.severity.value.upper()}] {alert.title}\n{alert.message}",
            "alert_id": alert.id,
            "severity": alert.severity.value,
            "status": alert.status.value,
            "device_id": alert.device_id,
            "triggered_at": alert.triggered_at.isoformat(),
        }

        # Slack-compatible format
        if "slack" in url.lower() or self.config.get("format") == "slack":
            payload = {
                "text": f":rotating_light: *{alert.severity.value.upper()}*: {alert.title}",
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*{alert.title}*\n{alert.message}",
                        },
                    }
                ],
            }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
            logger.info("Webhook sent for alert %d", alert.id)
            return True
        except Exception:
            logger.exception("Failed to send webhook for alert %d", alert.id)
            return False
