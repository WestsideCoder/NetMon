# SPDX-License-Identifier: GPL-3.0-or-later
"""
Syslog and SNMP trap models.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SyslogEntry(Base):
    __tablename__ = "syslog_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("devices.id"), index=True
    )
    source_ip: Mapped[str] = mapped_column(String(45), index=True)
    facility: Mapped[int] = mapped_column(Integer)
    severity: Mapped[int] = mapped_column(Integer, index=True)
    message: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    def __repr__(self) -> str:
        return f"<SyslogEntry(id={self.id}, source_ip='{self.source_ip}')>"


class SNMPTrap(Base):
    __tablename__ = "snmp_traps"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("devices.id"), index=True
    )
    source_ip: Mapped[str] = mapped_column(String(45), index=True)
    oid: Mapped[str] = mapped_column(String(200), index=True)
    value: Mapped[Optional[str]] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    def __repr__(self) -> str:
        return f"<SNMPTrap(id={self.id}, oid='{self.oid}')>"
