# SPDX-License-Identifier: GPL-3.0-or-later
"""
Network discovery scanner using fping and optional SNMP probing.
Scan state is stored in Redis so it works across multiple uvicorn workers.
"""
import ipaddress
import json
import logging
import subprocess
import threading
import uuid
from typing import List, Optional

import redis

from app.config import settings
from app.schemas.scanner import DiscoveredDevice, ScanResultResponse

logger = logging.getLogger(__name__)

_REDIS_PREFIX = "scan:"
_REDIS_TTL = 600  # 10 minutes


def _redis_client() -> redis.Redis:
    return redis.from_url(str(settings.REDIS_URL), decode_responses=True)


def _save_scan(scan_id: str, data: dict) -> None:
    r = _redis_client()
    r.setex(f"{_REDIS_PREFIX}{scan_id}", _REDIS_TTL, json.dumps(data))
    r.close()


def _load_scan(scan_id: str) -> Optional[dict]:
    r = _redis_client()
    raw = r.get(f"{_REDIS_PREFIX}{scan_id}")
    r.close()
    if raw:
        return json.loads(raw)
    return None


def parse_ip_range(range_str: str) -> List[str]:
    """Parse CIDR notation or dash-range into list of IPs."""
    range_str = range_str.strip()
    if "/" in range_str:
        network = ipaddress.ip_network(range_str, strict=False)
        return [str(ip) for ip in network.hosts()]
    if "-" in range_str:
        parts = range_str.rsplit(".", 1)
        if len(parts) == 2:
            base = parts[0]
            range_part = parts[1]
            if "-" in range_part:
                start_s, end_s = range_part.split("-", 1)
                start, end = int(start_s), int(end_s)
                return [f"{base}.{i}" for i in range(start, end + 1)]
    # Single IP — validate it
    ipaddress.ip_address(range_str)  # raises ValueError if invalid
    return [range_str]


def fping_scan(ips: List[str]) -> dict[str, Optional[float]]:
    """Run fping against list of IPs, return dict of ip -> response_time_ms or None."""
    if not ips:
        return {}
    # Validate all IPs before passing to subprocess
    validated = []
    for ip in ips:
        try:
            ipaddress.ip_address(ip)
            validated.append(ip)
        except ValueError:
            logger.warning("Skipping invalid IP: %s", ip)
    ips = validated
    if not ips:
        return {}
    try:
        proc = subprocess.run(
            ["fping", "-c", "3", "-q", "-t", "500"] + ips,
            capture_output=True,
            text=True,
            timeout=120,
        )
        # fping outputs stats to stderr
        results = {}
        for line in proc.stderr.splitlines():
            # Format: "192.168.1.1 : xmt/rcv/%loss = 3/3/0%, min/avg/max = 1.2/1.5/2.0"
            if ":" not in line:
                continue
            ip_part = line.split(":")[0].strip()
            if "min/avg/max" in line:
                avg = line.split("min/avg/max = ")[1].split("/")[1]
                results[ip_part] = float(avg)
            else:
                results[ip_part] = None
        return results
    except FileNotFoundError:
        logger.warning("fping not found, falling back to basic scan")
        return {ip: None for ip in ips}
    except subprocess.TimeoutExpired:
        logger.error("fping timed out")
        return {}


def start_scan(
    range_str: str,
    site_id: int,
    test_snmp: bool = False,
    credential_ids: Optional[List[int]] = None,
    credentials: Optional[List] = None,
) -> ScanResultResponse:
    """Start a scan in a background thread. Returns immediately with scan_id."""
    scan_id = str(uuid.uuid4())
    ips = parse_ip_range(range_str)

    scan_data = {
        "scan_id": scan_id,
        "status": "pinging",
        "total_ips": len(ips),
        "scanned": 0,
        "alive": 0,
        "snmp_total": 0,
        "snmp_tested": 0,
        "devices": [],
    }
    _save_scan(scan_id, scan_data)

    thread = threading.Thread(
        target=_run_scan,
        args=(scan_id, scan_data, ips, test_snmp, credentials or []),
        daemon=True,
    )
    thread.start()
    return ScanResultResponse(**scan_data)


def _run_scan(
    scan_id: str,
    scan_data: dict,
    ips: List[str],
    test_snmp: bool,
    credentials: List,
) -> None:
    """Run the scan in a background thread, updating Redis as it progresses."""
    try:
        # Phase 1: fping
        scan_data["status"] = "pinging"
        _save_scan(scan_id, scan_data)
        ping_results = fping_scan(ips)

        # Phase 2: process results
        alive_devices = []
        for ip in ips:
            scan_data["scanned"] += 1
            rt = ping_results.get(ip)
            is_alive = rt is not None
            if is_alive:
                scan_data["alive"] += 1
                dev = {
                    "ip_address": ip,
                    "hostname": None,
                    "is_alive": True,
                    "response_time": rt,
                    "snmp_sys_name": None,
                    "snmp_sys_descr": None,
                    "snmp_sys_object_id": None,
                    "detected_type": None,
                    "snmp_credential_id": None,
                }
                scan_data["devices"].append(dev)
                alive_devices.append(dev)

        # Update progress after ping phase
        _save_scan(scan_id, scan_data)

        # Phase 3: SNMP testing
        if test_snmp and credentials and alive_devices:
            scan_data["status"] = "snmp_testing"
            scan_data["snmp_total"] = len(alive_devices)
            scan_data["snmp_tested"] = 0
            _save_scan(scan_id, scan_data)

            for dev in alive_devices:
                _try_snmp_credentials(dev["ip_address"], credentials, dev)
                scan_data["snmp_tested"] += 1
                # Update Redis every 5 hosts or on last one
                if scan_data["snmp_tested"] % 5 == 0 or scan_data["snmp_tested"] == scan_data["snmp_total"]:
                    _save_scan(scan_id, scan_data)

        scan_data["status"] = "completed"
        _save_scan(scan_id, scan_data)
    except Exception as e:
        logger.error("Scan failed: %s", e)
        scan_data["status"] = "failed"
        _save_scan(scan_id, scan_data)


def _try_snmp_credentials(
    ip: str,
    credentials: List,
    device: dict,
) -> None:
    """Try each SNMP credential against a host, stop on first success."""
    from app.services import snmp_service

    for cred in credentials:
        try:
            result = snmp_service.test_credential(ip, cred)
            if result.success:
                device["snmp_sys_name"] = result.sys_name
                device["snmp_sys_descr"] = result.sys_descr
                device["snmp_sys_object_id"] = result.sys_object_id
                device["detected_type"] = result.detected_type
                device["snmp_credential_id"] = cred.id
                logger.info("SNMP success for %s with credential '%s'", ip, cred.name)
                return
        except Exception as e:
            logger.debug("SNMP credential '%s' failed for %s: %s", cred.name, ip, e)
    logger.debug("No SNMP credentials worked for %s", ip)


def get_scan_result(scan_id: str) -> Optional[ScanResultResponse]:
    data = _load_scan(scan_id)
    if data:
        return ScanResultResponse(**data)
    return None
