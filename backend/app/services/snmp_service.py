# SPDX-License-Identifier: GPL-3.0-or-later
"""
SNMP polling service using pysnmp.
"""
import logging
from typing import Optional

from pysnmp.hlapi import (
    getCmd, nextCmd, bulkCmd,
    SnmpEngine, CommunityData, UsmUserData,
    UdpTransportTarget, ContextData, ObjectType, ObjectIdentity,
)
from pysnmp.hlapi import usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol
from pysnmp.hlapi import usmDESPrivProtocol, usmAesCfb128Protocol

from app.core.encryption import decrypt_value
from app.models.snmp import SNMPCredential, SNMPVersion
from app.schemas.snmp import SNMPTestResponse

logger = logging.getLogger(__name__)

# Well-known OIDs
SYS_NAME = "1.3.6.1.2.1.1.5.0"
SYS_DESCR = "1.3.6.1.2.1.1.1.0"
SYS_OBJECT_ID = "1.3.6.1.2.1.1.2.0"
SYS_UPTIME = "1.3.6.1.2.1.1.3.0"

AUTH_PROTOCOLS = {
    "MD5": usmHMACMD5AuthProtocol,
    "SHA": usmHMACSHAAuthProtocol,
}
PRIV_PROTOCOLS = {
    "DES": usmDESPrivProtocol,
    "AES": usmAesCfb128Protocol,
}


def _build_auth(credential: SNMPCredential):
    if credential.version in (SNMPVersion.V1, SNMPVersion.V2C):
        mp_model = 0 if credential.version == SNMPVersion.V1 else 1
        community = decrypt_value(credential.community) or "public"
        return CommunityData(community, mpModel=mp_model)
    # v3
    auth_proto = AUTH_PROTOCOLS.get(credential.auth_protocol, usmHMACMD5AuthProtocol)
    priv_proto = PRIV_PROTOCOLS.get(credential.priv_protocol, usmDESPrivProtocol)
    return UsmUserData(
        credential.username or "",
        decrypt_value(credential.auth_password) or "",
        decrypt_value(credential.priv_password) or "",
        authProtocol=auth_proto,
        privProtocol=priv_proto,
    )


def snmp_get(ip: str, credential: SNMPCredential, oids: list[str]) -> dict:
    """Synchronous SNMP GET for use in Celery tasks."""
    auth = _build_auth(credential)
    target = UdpTransportTarget((ip, credential.port), timeout=5, retries=1)
    obj_types = [ObjectType(ObjectIdentity(oid)) for oid in oids]

    error_indication, error_status, error_index, var_binds = next(
        getCmd(SnmpEngine(), auth, target, ContextData(), *obj_types)
    )
    if error_indication or error_status:
        logger.warning("SNMP GET error for %s: %s %s", ip, error_indication, error_status)
        return {}
    return {str(oid): str(val) for oid, val in var_binds}


def snmp_walk(ip: str, credential: SNMPCredential, oid: str) -> list[tuple]:
    """Synchronous SNMP WALK."""
    auth = _build_auth(credential)
    target = UdpTransportTarget((ip, credential.port), timeout=5, retries=1)
    results = []
    for error_indication, error_status, error_index, var_binds in nextCmd(
        SnmpEngine(), auth, target, ContextData(),
        ObjectType(ObjectIdentity(oid)),
        lexicographicMode=False,
    ):
        if error_indication or error_status:
            break
        for oid_val, val in var_binds:
            results.append((str(oid_val), str(val)))
    return results


def test_credential(ip: str, credential: SNMPCredential) -> SNMPTestResponse:
    """Test SNMP credential against a device."""
    try:
        result = snmp_get(ip, credential, [SYS_NAME, SYS_DESCR, SYS_OBJECT_ID])
        if not result:
            return SNMPTestResponse(success=False, error="No response from device")
        sys_descr = result.get(SYS_DESCR, "")
        return SNMPTestResponse(
            success=True,
            sys_name=result.get(SYS_NAME),
            sys_descr=sys_descr,
            sys_object_id=result.get(SYS_OBJECT_ID),
            detected_type=_detect_device_type(
                result.get(SYS_OBJECT_ID, ""),
                sys_descr,
            ),
            os_info=_extract_os_info(sys_descr),
        )
    except Exception as e:
        return SNMPTestResponse(success=False, error=str(e))


def _detect_device_type(sys_object_id: str, sys_descr: str) -> Optional[str]:
    oid = sys_object_id or ""
    descr = sys_descr.lower()

    # --- OID-based detection (most reliable) ---
    # Cisco (1.3.6.1.4.1.9)
    if oid.startswith("1.3.6.1.4.1.9."):
        if any(k in descr for k in ("switch", "catalyst", "sg", "sf")):
            return "switch"
        if any(k in descr for k in ("air", "aironet", "access point", "wireless")):
            return "access_point"
        return "router"
    # APC / Schneider (1.3.6.1.4.1.318)
    if oid.startswith("1.3.6.1.4.1.318."):
        return "ups"
    # Eaton (1.3.6.1.4.1.534)
    if oid.startswith("1.3.6.1.4.1.534."):
        return "ups"
    # Liebert/Vertiv (1.3.6.1.4.1.476)
    if oid.startswith("1.3.6.1.4.1.476."):
        return "ups"
    # Ubiquiti (1.3.6.1.4.1.41112)
    if oid.startswith("1.3.6.1.4.1.41112."):
        if any(k in descr for k in ("uap", "unifi ap", "access point", "wireless")):
            return "access_point"
        if any(k in descr for k in ("usw", "switch")):
            return "switch"
        return "access_point"
    # Aruba (1.3.6.1.4.1.14823)
    if oid.startswith("1.3.6.1.4.1.14823."):
        if any(k in descr for k in ("switch", "cx")):
            return "switch"
        return "access_point"
    # Ruckus (1.3.6.1.4.1.25053)
    if oid.startswith("1.3.6.1.4.1.25053."):
        return "access_point"
    # Juniper (1.3.6.1.4.1.2636)
    if oid.startswith("1.3.6.1.4.1.2636."):
        # EX and QFX series are switches, SRX/MX/PTX are routers
        if any(k in descr for k in ("ex2", "ex3", "ex4", "ex8", "ex9", "qfx", "switch")):
            return "switch"
        return "router"
    # Fortinet (1.3.6.1.4.1.12356)
    if oid.startswith("1.3.6.1.4.1.12356."):
        return "router"
    # HP/Aruba networking (1.3.6.1.4.1.11)
    if oid.startswith("1.3.6.1.4.1.11."):
        if any(k in descr for k in ("switch", "procurve")):
            return "switch"
        if any(k in descr for k in ("access point", "wireless", "iap")):
            return "access_point"
    # Axis cameras (1.3.6.1.4.1.368)
    if oid.startswith("1.3.6.1.4.1.368."):
        return "camera"
    # Hikvision (1.3.6.1.4.1.39165)
    if oid.startswith("1.3.6.1.4.1.39165."):
        return "camera"
    # Microsoft Windows (1.3.6.1.4.1.311)
    if oid.startswith("1.3.6.1.4.1.311."):
        return "server"
    # Net-SNMP / Linux (1.3.6.1.4.1.8072)
    if oid.startswith("1.3.6.1.4.1.8072."):
        # Net-SNMP agent — could be server or embedded Linux IoT
        # Check description for clues
        if any(k in descr for k in ("ntp", "gps", "time", "stratum", "chrony", "ntpd")):
            return "iot"
        if any(k in descr for k in ("camera", "dvr", "nvr")):
            return "camera"
        return "server"

    # --- Description-based detection (fallback) ---
    # UPS keywords
    if any(k in descr for k in ("ups", "apc", "eaton", "liebert", "battery backup")):
        return "ups"
    # Camera keywords
    if any(k in descr for k in ("camera", "ipcam", "dvr", "nvr", "hikvision", "axis", "dahua")):
        return "camera"
    # Wireless / AP keywords
    if any(k in descr for k in ("access point", "wireless", "aironet", "unifi ap", "ruckus", "aruba")):
        return "access_point"
    # Switch keywords
    if any(k in descr for k in ("switch", "catalyst", "procurve", "ex2200", "ex2300", "ex3400", "ex4300", "qfx")):
        return "switch"
    # Router keywords
    if any(k in descr for k in ("router", "firewall", "fortigate", "pfsense", "opnsense", "juniper", "junos", "srx", "mx ")):
        return "router"
    # IoT keywords
    if any(k in descr for k in ("ntp", "gps", "sensor", "iot", "embedded", "raspberry", "arduino")):
        return "iot"
    # Cisco in descr (without OID match)
    if "cisco" in descr:
        return "router"
    # Windows
    if any(k in descr for k in ("windows", "microsoft", "hardware: intel", "software: windows")):
        return "server"
    # Linux — last resort, many embedded devices report as Linux
    if any(k in descr for k in ("linux", "net-snmp", "ubuntu", "centos", "debian", "rhel", "redhat")):
        return "server"

    return "other"


def _extract_os_info(sys_descr: str) -> Optional[str]:
    """Extract a human-readable OS string from sysDescr."""
    if not sys_descr:
        return None
    d = sys_descr.lower()
    if "windows" in d:
        # e.g. "Software: Windows Version 6.3 (Build 17763 ...)"
        import re
        m = re.search(r'windows\s+version\s+[\d.]+\s*\(build\s+\d+', sys_descr, re.IGNORECASE)
        if m:
            return f"Windows ({m.group(0).split('(')[1].strip()})"
        return "Windows Server"
    if "ubuntu" in d:
        return "Ubuntu Linux"
    if "centos" in d:
        return "CentOS Linux"
    if "debian" in d:
        return "Debian Linux"
    if "red hat" in d or "rhel" in d:
        return "Red Hat Linux"
    if "linux" in d:
        return "Linux"
    if "cisco" in d:
        return "Cisco IOS"
    if "junos" in d:
        return "Juniper JunOS"
    if "apc" in d:
        return "APC UPS"
    if "freebsd" in d:
        return "FreeBSD"
    return None
