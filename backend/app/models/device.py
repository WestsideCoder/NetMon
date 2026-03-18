# SPDX-License-Identifier: GPL-3.0-or-later
"""
Device model - core entity representing monitored network devices.
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.database import Base


class DeviceType(str, enum.Enum):
    UPS = "ups"
    SWITCH = "switch"
    ROUTER = "router"
    SERVER = "server"
    CAMERA = "camera"
    ACCESS_POINT = "access_point"
    IOT = "iot"
    OTHER = "other"


class DeviceStatus(str, enum.Enum):
    ONLINE = "online"
    WARNING = "warning"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    ip_address: Mapped[str] = mapped_column(String(45), unique=True, index=True)
    device_type: Mapped[Optional[DeviceType]] = mapped_column(SQLEnum(DeviceType))
    mac_address: Mapped[Optional[str]] = mapped_column(String(17))
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    vlan: Mapped[Optional[str]] = mapped_column(String(50), index=True)

    # Status & Monitoring
    status: Mapped[DeviceStatus] = mapped_column(
        SQLEnum(DeviceStatus), default=DeviceStatus.UNKNOWN, index=True
    )
    status_reason: Mapped[Optional[str]] = mapped_column(String(100))
    response_time: Mapped[Optional[float]] = mapped_column(Float)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_check: Mapped[Optional[datetime]] = mapped_column(DateTime)
    check_interval: Mapped[int] = mapped_column(Integer, default=60)

    # Ping Statistics
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_successes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_checks: Mapped[int] = mapped_column(Integer, default=0)
    successful_checks: Mapped[int] = mapped_column(Integer, default=0)

    # SNMP Configuration
    snmp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    snmp_credential_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("snmp_credentials.id")
    )
    snmp_template_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("device_templates.id")
    )

    # HTTP Monitoring
    http_url: Mapped[Optional[str]] = mapped_column(String(500))
    http_expected_status: Mapped[Optional[int]] = mapped_column(Integer)
    https_cert_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime)
    http_response_time: Mapped[Optional[float]] = mapped_column(Float)

    # NTP & Web Checks
    ntp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    web_check_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ntp_offset_ms: Mapped[Optional[float]] = mapped_column(Float)
    ntp_rtt_ms: Mapped[Optional[float]] = mapped_column(Float)
    ntp_server_time: Mapped[Optional[str]] = mapped_column(String(50))
    ntp_stratum: Mapped[Optional[int]] = mapped_column(Integer)
    ntp_reference_id: Mapped[Optional[str]] = mapped_column(String(20))
    ntp_consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)

    # Map Position
    map_x: Mapped[Optional[float]] = mapped_column(Float)
    map_y: Mapped[Optional[float]] = mapped_column(Float)

    # Maintenance
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_until: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # System info (from SNMP sysDescr)
    os_info: Mapped[Optional[str]] = mapped_column(String(200))

    # Metadata
    notes: Mapped[Optional[str]] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    site: Mapped["Site"] = relationship("Site", back_populates="devices")
    snmp_credential: Mapped[Optional["SNMPCredential"]] = relationship(
        "SNMPCredential", back_populates="devices"
    )
    snmp_template: Mapped[Optional["DeviceTemplate"]] = relationship("DeviceTemplate")
    status_history: Mapped[List["StatusHistory"]] = relationship(
        "StatusHistory", back_populates="device", cascade="all, delete-orphan"
    )
    snmp_data: Mapped[List["SNMPData"]] = relationship(
        "SNMPData", back_populates="device", cascade="all, delete-orphan"
    )
    alerts: Mapped[List["Alert"]] = relationship(
        "Alert", back_populates="device", cascade="all, delete-orphan"
    )

    @property
    def uptime_percentage(self) -> float:
        if self.total_checks == 0:
            return 0.0
        return (self.successful_checks / self.total_checks) * 100

    def __repr__(self) -> str:
        return f"<Device(id={self.id}, name='{self.name}', ip='{self.ip_address}')>"
