# SPDX-License-Identifier: GPL-3.0-or-later
"""
Alert, alert rule, notification channel, and status history models.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.database import Base


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    rule_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("alert_rules.id"), index=True
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        SQLEnum(AlertSeverity), index=True
    )
    status: Mapped[AlertStatus] = mapped_column(
        SQLEnum(AlertStatus), default=AlertStatus.ACTIVE, index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    metric_name: Mapped[Optional[str]] = mapped_column(String(100))
    metric_value: Mapped[Optional[str]] = mapped_column(String(100))
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    acknowledged_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    webhook_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    device: Mapped["Device"] = relationship("Device", back_populates="alerts")

    def __repr__(self) -> str:
        return f"<Alert(id={self.id}, device_id={self.device_id}, severity='{self.severity}')>"


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    metric_name: Mapped[str] = mapped_column(String(100))
    condition: Mapped[str] = mapped_column(String(20))  # gt, lt, eq, ne, gte, lte
    threshold: Mapped[float] = mapped_column(Float)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    severity: Mapped[AlertSeverity] = mapped_column(SQLEnum(AlertSeverity))
    device_type: Mapped[Optional[str]] = mapped_column(String(50))
    template_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("device_templates.id")
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return f"<AlertRule(id={self.id}, name='{self.name}')>"


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    channel_type: Mapped[str] = mapped_column(String(50))  # email, webhook, slack
    config: Mapped[str] = mapped_column(Text)  # JSON
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<NotificationChannel(id={self.id}, name='{self.name}')>"


class EscalationPolicy(Base):
    __tablename__ = "escalation_policies"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    delay_minutes: Mapped[int] = mapped_column(Integer, default=15)
    channel_id: Mapped[int] = mapped_column(
        ForeignKey("notification_channels.id")
    )
    min_severity: Mapped[AlertSeverity] = mapped_column(SQLEnum(AlertSeverity))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<EscalationPolicy(id={self.id}, name='{self.name}')>"


class StatusHistory(Base):
    __tablename__ = "status_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    response_time: Mapped[Optional[float]] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    device: Mapped["Device"] = relationship("Device", back_populates="status_history")

    def __repr__(self) -> str:
        return f"<StatusHistory(device_id={self.device_id}, status='{self.status}')>"


class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    start_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    affected_devices: Mapped[str] = mapped_column(Text)  # JSON array
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<MaintenanceWindow(id={self.id}, name='{self.name}')>"
