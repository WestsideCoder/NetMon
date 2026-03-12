# SPDX-License-Identifier: GPL-3.0-or-later
"""
Database models package.
All models must be imported here for Alembic autodiscovery.
"""
from app.models.site import Site
from app.models.device import Device, DeviceType, DeviceStatus
from app.models.snmp import SNMPCredential, SNMPData, DeviceTemplate, SNMPVersion
from app.models.alert import (
    Alert, AlertRule, NotificationChannel, EscalationPolicy,
    StatusHistory, MaintenanceWindow, AlertSeverity, AlertStatus,
)
from app.models.user import User, UserRole, AuthSource
from app.models.syslog import SyslogEntry, SNMPTrap
from app.models.map_image import MapImage
from app.models.ssl_certificate import SSLCertificate, CertificateType

# Re-export Base for Alembic
from app.database import Base

__all__ = [
    "Base",
    "Site",
    "Device", "DeviceType", "DeviceStatus",
    "SNMPCredential", "SNMPData", "DeviceTemplate", "SNMPVersion",
    "Alert", "AlertRule", "NotificationChannel", "EscalationPolicy",
    "StatusHistory", "MaintenanceWindow", "AlertSeverity", "AlertStatus",
    "User", "UserRole", "AuthSource",
    "SyslogEntry", "SNMPTrap",
    "MapImage",
    "SSLCertificate", "CertificateType",
]
