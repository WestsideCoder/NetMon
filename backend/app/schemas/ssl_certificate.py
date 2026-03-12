# SPDX-License-Identifier: GPL-3.0-or-later
"""
SSL Certificate schemas.
"""
import json
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from app.schemas import UTCDatetime


class GenerateCARequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    common_name: str = Field(..., min_length=1, max_length=500)
    organization: str = Field("NetMon", max_length=200)
    validity_days: int = Field(3650, ge=1, le=36500)
    key_size: int = Field(4096, ge=2048, le=8192)


class GenerateCSRRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    common_name: str = Field(..., min_length=1, max_length=500)
    organization: str = Field("NetMon", max_length=200)
    san_dns_names: List[str] = Field(default_factory=list)
    san_ip_addresses: List[str] = Field(default_factory=list)
    key_size: int = Field(2048, ge=2048, le=8192)


class GenerateServerCertRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    common_name: str = Field(..., min_length=1, max_length=500)
    san_dns_names: List[str] = Field(default_factory=list)
    san_ip_addresses: List[str] = Field(default_factory=list)
    validity_days: int = Field(365, ge=1, le=3650)
    key_size: int = Field(2048, ge=2048, le=8192)


class SSLCertificateResponse(BaseModel):
    id: int
    name: str
    cert_type: str
    common_name: str
    subject_alt_names: Optional[List[str]] = None
    issuer: Optional[str] = None
    serial_number: Optional[str] = None
    not_before: Optional[UTCDatetime] = None
    not_after: Optional[UTCDatetime] = None
    fingerprint_sha256: Optional[str] = None
    is_active: bool
    is_ca: bool
    has_csr: bool = False
    uploaded_by: Optional[int] = None
    created_at: UTCDatetime

    @field_validator("subject_alt_names", mode="before")
    @classmethod
    def parse_san_json(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v

    class Config:
        from_attributes = True


class SSLCertificateListResponse(BaseModel):
    items: List[SSLCertificateResponse]
    total: int


class SSLStatusResponse(BaseModel):
    has_ca: bool
    active_ca: Optional[SSLCertificateResponse] = None
    active_cert: Optional[SSLCertificateResponse] = None
    nginx_reload_available: bool
