# SPDX-License-Identifier: GPL-3.0-or-later
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.models.device import DeviceType, DeviceStatus
from app.schemas import UTCDatetime


class DeviceCreate(BaseModel):
    name: str
    ip_address: str
    device_type: Optional[DeviceType] = None
    site_id: int
    vlan: Optional[str] = None
    snmp_enabled: bool = False
    snmp_credential_id: Optional[int] = None
    snmp_template_id: Optional[int] = None
    http_url: Optional[str] = None
    http_expected_status: Optional[int] = None
    ntp_enabled: bool = False
    web_check_enabled: bool = False
    notes: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: Optional[DeviceType] = None
    site_id: Optional[int] = None
    vlan: Optional[str] = None
    snmp_enabled: Optional[bool] = None
    snmp_credential_id: Optional[int] = None
    snmp_template_id: Optional[int] = None
    http_url: Optional[str] = None
    http_expected_status: Optional[int] = None
    ntp_enabled: Optional[bool] = None
    web_check_enabled: Optional[bool] = None
    os_info: Optional[str] = None
    maintenance_mode: Optional[bool] = None
    maintenance_until: Optional[datetime] = None
    notes: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None


class DeviceResponse(BaseModel):
    id: int
    name: str
    ip_address: str
    device_type: Optional[DeviceType]
    mac_address: Optional[str]
    site_id: int
    site_name: Optional[str] = None
    vlan: Optional[str]
    status: DeviceStatus
    status_reason: Optional[str] = None
    response_time: Optional[float]
    last_seen: Optional[UTCDatetime]
    last_check: Optional[UTCDatetime]
    consecutive_failures: int
    total_checks: int
    successful_checks: int
    uptime_percentage: float
    snmp_enabled: bool
    snmp_credential_id: Optional[int]
    snmp_template_id: Optional[int] = None
    http_url: Optional[str]
    http_response_time: Optional[float]
    ntp_enabled: bool
    web_check_enabled: bool
    ntp_offset_ms: Optional[float] = None
    ntp_rtt_ms: Optional[float] = None
    ntp_server_time: Optional[str] = None
    ntp_stratum: Optional[int] = None
    ntp_reference_id: Optional[str] = None
    os_info: Optional[str] = None
    maintenance_mode: bool
    maintenance_until: Optional[UTCDatetime]
    notes: Optional[str]
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    created_at: UTCDatetime
    updated_at: UTCDatetime

    class Config:
        from_attributes = True


class DevicePositionUpdate(BaseModel):
    id: int
    map_x: Optional[float] = None
    map_y: Optional[float] = None


class DeviceBulkUpdate(BaseModel):
    ids: List[int]
    updates: DeviceUpdate


class DeviceListResponse(BaseModel):
    items: List[DeviceResponse]
    total: int
    page: int
    per_page: int


class DeviceStats(BaseModel):
    total: int
    online: int
    warning: int
    offline: int
    unknown: int
