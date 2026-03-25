# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Optional, List
from pydantic import BaseModel
from app.models.alert import AlertSeverity, AlertStatus
from app.schemas import UTCDatetime


class AlertResponse(BaseModel):
    id: int
    device_id: int
    device_name: Optional[str] = None
    rule_id: Optional[int]
    severity: AlertSeverity
    status: AlertStatus
    title: str
    message: str
    metric_name: Optional[str]
    metric_value: Optional[str]
    triggered_at: UTCDatetime
    acknowledged_at: Optional[UTCDatetime]
    resolved_at: Optional[UTCDatetime]
    acknowledged_by: Optional[int]

    class Config:
        from_attributes = True


class AlertListResponse(BaseModel):
    items: List[AlertResponse]
    total: int
    page: int
    per_page: int


class AlertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    metric_name: str
    condition: str  # gt, lt, eq, ne, gte, lte
    threshold: float
    duration_seconds: int = 0
    severity: AlertSeverity = AlertSeverity.WARNING
    device_type: Optional[str] = None
    template_id: Optional[int] = None
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    metric_name: Optional[str] = None
    condition: Optional[str] = None
    threshold: Optional[float] = None
    duration_seconds: Optional[int] = None
    severity: Optional[AlertSeverity] = None
    device_type: Optional[str] = None
    template_id: Optional[int] = None
    enabled: Optional[bool] = None


class AlertRuleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    metric_name: str
    condition: str
    threshold: float
    duration_seconds: int
    severity: AlertSeverity
    device_type: Optional[str]
    template_id: Optional[int]
    enabled: bool
    created_at: UTCDatetime

    class Config:
        from_attributes = True


class NotificationChannelCreate(BaseModel):
    name: str
    channel_type: str  # email, webhook, slack, pushover
    config: str  # JSON string
    enabled: bool = True


class NotificationChannelResponse(BaseModel):
    id: int
    name: str
    channel_type: str
    config: str
    enabled: bool
    created_at: UTCDatetime

    class Config:
        from_attributes = True
