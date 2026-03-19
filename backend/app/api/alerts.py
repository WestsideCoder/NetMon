# SPDX-License-Identifier: GPL-3.0-or-later
"""
Alert management, rules, and notification channel endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import joinedload

from app.database import get_db
from app.models.user import User, UserRole
from app.models.alert import Alert, AlertRule, AlertStatus, NotificationChannel
from app.models.device import Device
from app.core.security import get_current_user, require_role
from app.schemas.alert import (
    AlertResponse, AlertListResponse,
    AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse,
    NotificationChannelCreate, NotificationChannelResponse,
)

router = APIRouter()


def _alert_response(alert: Alert) -> AlertResponse:
    resp = AlertResponse.model_validate(alert)
    if alert.device:
        resp.device_name = alert.device.name
    return resp


@router.get("/", response_model=AlertListResponse)
async def list_alerts(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = None,
    device_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = select(Alert).join(Alert.device).options(joinedload(Alert.device))
    count_query = select(func.count(Alert.id)).join(Alert.device)

    # Exclude maintenance devices from active/acknowledged views
    if status_filter in (None, "", "active", "acknowledged"):
        query = query.where(Device.maintenance_mode == False)
        count_query = count_query.where(Device.maintenance_mode == False)

    if status_filter:
        query = query.where(Alert.status == status_filter)
        count_query = count_query.where(Alert.status == status_filter)
    if severity:
        query = query.where(Alert.severity == severity)
        count_query = count_query.where(Alert.severity == severity)
    if device_id:
        query = query.where(Alert.device_id == device_id)
        count_query = count_query.where(Alert.device_id == device_id)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(Alert.triggered_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    alerts = result.unique().scalars().all()

    return AlertListResponse(
        items=[_alert_response(a) for a in alerts],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/active", response_model=list[AlertResponse])
async def active_alerts(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Alert)
        .join(Alert.device)
        .options(joinedload(Alert.device))
        .where(
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
            Device.maintenance_mode == False,
        )
        .order_by(Alert.triggered_at.desc())
        .limit(100)
    )
    return [_alert_response(a) for a in result.unique().scalars().all()]


@router.post("/{alert_id}/ack", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.OPERATOR)),
):
    from datetime import datetime
    alert = await db.get(Alert, alert_id, options=[joinedload(Alert.device)])
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.status != AlertStatus.ACTIVE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alert is not active")
    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = user.id
    await db.flush()
    await db.refresh(alert)
    return _alert_response(alert)


@router.post("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.OPERATOR)),
):
    from datetime import datetime
    alert = await db.get(Alert, alert_id, options=[joinedload(Alert.device)])
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if alert.status == AlertStatus.RESOLVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alert already resolved")
    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = datetime.utcnow()
    await db.flush()
    await db.refresh(alert)
    return _alert_response(alert)


# --- Alert Rules ---

@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(AlertRule).order_by(AlertRule.name))
    return [AlertRuleResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    data: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    rule = AlertRule(**data.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_rule(
    rule_id: int,
    data: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    allowed_fields = {"name", "metric_name", "condition", "threshold", "severity", "device_type", "enabled"}
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in allowed_fields:
            setattr(rule, field, value)
    await db.flush()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    await db.delete(rule)
    await db.flush()
    return {"detail": "Rule deleted"}


# --- Notification Channels ---

@router.get("/channels", response_model=list[NotificationChannelResponse])
async def list_channels(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    result = await db.execute(
        select(NotificationChannel).order_by(NotificationChannel.name)
    )
    return [NotificationChannelResponse.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/channels",
    response_model=NotificationChannelResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_channel(
    data: NotificationChannelCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    channel = NotificationChannel(**data.model_dump())
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    return NotificationChannelResponse.model_validate(channel)


@router.put("/channels/{channel_id}", response_model=NotificationChannelResponse)
async def update_channel(
    channel_id: int,
    data: NotificationChannelCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    channel = await db.get(NotificationChannel, channel_id)
    if not channel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Channel not found")
    for field, value in data.model_dump().items():
        setattr(channel, field, value)
    await db.flush()
    await db.refresh(channel)
    return NotificationChannelResponse.model_validate(channel)


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.ADMIN)),
):
    channel = await db.get(NotificationChannel, channel_id)
    if not channel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Channel not found")
    await db.delete(channel)
    await db.flush()
    return {"detail": "Channel deleted"}
