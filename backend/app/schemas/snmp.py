# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Optional
from pydantic import BaseModel
from app.models.snmp import SNMPVersion
from app.schemas import UTCDatetime


class SNMPCredentialCreate(BaseModel):
    name: str
    version: SNMPVersion = SNMPVersion.V2C
    port: int = 161
    community: Optional[str] = None
    username: Optional[str] = None
    auth_protocol: Optional[str] = None
    auth_password: Optional[str] = None
    priv_protocol: Optional[str] = None
    priv_password: Optional[str] = None
    description: Optional[str] = None


class SNMPCredentialUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[SNMPVersion] = None
    port: Optional[int] = None
    community: Optional[str] = None
    username: Optional[str] = None
    auth_protocol: Optional[str] = None
    auth_password: Optional[str] = None
    priv_protocol: Optional[str] = None
    priv_password: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class SNMPCredentialResponse(BaseModel):
    id: int
    name: str
    version: SNMPVersion
    port: int
    community: Optional[str]  # will be masked in API layer
    username: Optional[str]
    auth_protocol: Optional[str]
    priv_protocol: Optional[str]
    description: Optional[str]
    enabled: bool
    created_at: UTCDatetime
    updated_at: UTCDatetime

    class Config:
        from_attributes = True


class SNMPTestRequest(BaseModel):
    ip_address: str
    credential_id: int


class SNMPTestResponse(BaseModel):
    success: bool
    sys_name: Optional[str] = None
    sys_descr: Optional[str] = None
    sys_object_id: Optional[str] = None
    detected_type: Optional[str] = None
    os_info: Optional[str] = None
    error: Optional[str] = None


class SNMPMetricLatest(BaseModel):
    oid_name: str
    value: str
    value_type: str
    timestamp: UTCDatetime


class SNMPHistoryPoint(BaseModel):
    timestamp: UTCDatetime
    value: str


class SNMPDeviceDataResponse(BaseModel):
    device_id: int
    device_type: Optional[str] = None
    template_name: Optional[str] = None
    latest: list[SNMPMetricLatest] = []
    history: dict[str, list[SNMPHistoryPoint]] = {}


class SNMPSummaryDevice(BaseModel):
    device_id: int
    device_name: str
    device_type: Optional[str] = None
    ip_address: str
    status: str
    key_metric_name: Optional[str] = None
    key_metric_value: Optional[str] = None
    key_metric_type: Optional[str] = None

    class Config:
        from_attributes = True


class SNMPSummaryResponse(BaseModel):
    devices: list[SNMPSummaryDevice] = []
