# SPDX-License-Identifier: GPL-3.0-or-later
"""
Abstract notification channel base class.
"""
from abc import ABC, abstractmethod
from app.models.alert import Alert


class BaseNotificationChannel(ABC):
    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    async def send(self, alert: Alert) -> bool:
        """Send notification for an alert. Returns True on success."""
        ...
