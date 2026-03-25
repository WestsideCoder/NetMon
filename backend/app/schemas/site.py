# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Optional, List
from pydantic import BaseModel
from app.schemas import UTCDatetime


class SiteCreate(BaseModel):
    name: str
    location: Optional[str] = None
    description: Optional[str] = None
    parent_site_id: Optional[int] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    map_image_url: Optional[str] = None
    map_config: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    parent_site_id: Optional[int] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    map_image_url: Optional[str] = None
    map_config: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None


class SiteResponse(BaseModel):
    id: int
    name: str
    location: Optional[str]
    description: Optional[str]
    parent_site_id: Optional[int]
    level: int
    contact_name: Optional[str]
    contact_email: Optional[str]
    map_image_url: Optional[str] = None
    map_config: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    device_count: int = 0
    created_at: UTCDatetime
    updated_at: UTCDatetime

    class Config:
        from_attributes = True


class SiteTreeResponse(BaseModel):
    id: int
    name: str
    location: Optional[str]
    level: int
    map_image_url: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    device_count: int = 0
    device_stats: "DeviceStatsBase" = None
    children: List["SiteTreeResponse"] = []

    class Config:
        from_attributes = True


class SiteChildWithStats(BaseModel):
    id: int
    name: str
    location: Optional[str] = None
    level: int
    map_image_url: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    device_stats: "DeviceStatsBase"


class DeviceStatsBase(BaseModel):
    total: int = 0
    online: int = 0
    warning: int = 0
    offline: int = 0
    maintenance: int = 0
    unknown: int = 0


class SitePositionUpdate(BaseModel):
    id: int
    map_x: Optional[float] = None
    map_y: Optional[float] = None


SiteTreeResponse.model_rebuild()
SiteChildWithStats.model_rebuild()
