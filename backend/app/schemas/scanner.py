# SPDX-License-Identifier: GPL-3.0-or-later
from typing import Optional, List
from pydantic import BaseModel


class ScanRequest(BaseModel):
    range: str  # CIDR or range like "192.168.1.1-254"
    site_id: int
    test_snmp: bool = False
    credential_ids: List[int] = []


class DiscoveredDevice(BaseModel):
    ip_address: str
    hostname: Optional[str] = None
    is_alive: bool = False
    response_time: Optional[float] = None
    snmp_sys_name: Optional[str] = None
    snmp_sys_descr: Optional[str] = None
    snmp_sys_object_id: Optional[str] = None
    detected_type: Optional[str] = None
    snmp_credential_id: Optional[int] = None


class ScanResultResponse(BaseModel):
    scan_id: str
    status: str  # pinging, snmp_testing, completed, failed
    total_ips: int
    scanned: int
    alive: int
    snmp_total: int = 0
    snmp_tested: int = 0
    devices: List[DiscoveredDevice] = []


class ImportRequest(BaseModel):
    scan_id: str
    site_id: int
    devices: List[str]  # list of IPs to import
