# SPDX-License-Identifier: GPL-3.0-or-later
"""
SNMP-related models: credentials, OID configuration, and monitoring data.
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.database import Base


class SNMPVersion(str, enum.Enum):
    V1 = "v1"
    V2C = "v2c"
    V3 = "v3"


class SNMPCredential(Base):
    __tablename__ = "snmp_credentials"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    version: Mapped[SNMPVersion] = mapped_column(
        SQLEnum(SNMPVersion), default=SNMPVersion.V2C
    )
    port: Mapped[int] = mapped_column(Integer, default=161)
    community: Mapped[Optional[str]] = mapped_column(String(200))
    username: Mapped[Optional[str]] = mapped_column(String(200))
    auth_protocol: Mapped[Optional[str]] = mapped_column(String(20))
    auth_password: Mapped[Optional[str]] = mapped_column(String(200))
    priv_protocol: Mapped[Optional[str]] = mapped_column(String(20))
    priv_password: Mapped[Optional[str]] = mapped_column(String(200))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    devices: Mapped[List["Device"]] = relationship(
        "Device", back_populates="snmp_credential"
    )

    def __repr__(self) -> str:
        return f"<SNMPCredential(id={self.id}, name='{self.name}', version='{self.version}')>"


class SNMPData(Base):
    __tablename__ = "snmp_data"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    oid: Mapped[str] = mapped_column(String(200), index=True)
    oid_name: Mapped[str] = mapped_column(String(200))
    value: Mapped[str] = mapped_column(String(500))
    value_type: Mapped[str] = mapped_column(String(50))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    device: Mapped["Device"] = relationship("Device", back_populates="snmp_data")

    def __repr__(self) -> str:
        return f"<SNMPData(device_id={self.device_id}, oid_name='{self.oid_name}')>"


class DeviceTemplate(Base):
    __tablename__ = "device_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    device_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text)
    sys_object_id_pattern: Mapped[Optional[str]] = mapped_column(String(200))
    sys_descr_pattern: Mapped[Optional[str]] = mapped_column(String(200))
    oid_config: Mapped[str] = mapped_column(Text)  # JSON
    alert_rules: Mapped[str] = mapped_column(Text)  # JSON
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return f"<DeviceTemplate(name='{self.name}', device_type='{self.device_type}')>"
