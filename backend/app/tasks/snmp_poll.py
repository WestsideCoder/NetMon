# SPDX-License-Identifier: GPL-3.0-or-later
"""
SNMP polling Celery task.
"""
import json
import logging
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.tasks import celery_app
from app.database import SyncSessionLocal
from app.models.device import Device, DeviceStatus
from app.models.snmp import SNMPData
from app.services.snmp_service import snmp_get, snmp_walk

# Battery status OID names and their critical/warning values
_UPS_BATTERY_STATUS_OIDS = {"upsBasicBatteryStatus", "upsBatteryStatus"}
# APC: 1=unknown, 2=batteryNormal, 3=batteryLow
# RFC 1628: 1=unknown, 2=batteryNormal, 3=batteryLow, 4=batteryDepleted

# Output source OID names — detect if UPS is running on battery power
_UPS_OUTPUT_SOURCE_OIDS = {"upsBasicOutputStatus", "upsOutputSource"}
# APC upsBasicOutputStatus: 1=unknown, 2=onLine, 3=onBattery, 4=onSmartBoost,
#   5=timedSleeping, 6=softwareBypass, 7=off, 8=rebooting, 9=switchedBypass,
#   10=hardwareFailureBypass, 11=sleepingUntilPowerReturn, 12=onSmartTrim
# RFC 1628 upsOutputSource: 1=other, 2=none, 3=normal, 4=bypass, 5=battery, 6=booster, 7=reducer

# HOST-RESOURCES-MIB OIDs (RFC 2790) — used for CPU, memory, disk on servers
_HR_PROCESSOR_LOAD = "1.3.6.1.2.1.25.3.3.1.2"      # hrProcessorLoad table
_HR_STORAGE_TYPE   = "1.3.6.1.2.1.25.2.3.1.2"       # hrStorageType column
_HR_STORAGE_DESCR  = "1.3.6.1.2.1.25.2.3.1.3"       # hrStorageDescr column
_HR_STORAGE_UNITS  = "1.3.6.1.2.1.25.2.3.1.4"       # hrStorageAllocationUnits
_HR_STORAGE_SIZE   = "1.3.6.1.2.1.25.2.3.1.5"       # hrStorageSize
_HR_STORAGE_USED   = "1.3.6.1.2.1.25.2.3.1.6"       # hrStorageUsed
# hrStorageType values
_HR_STORAGE_TYPE_RAM        = "1.3.6.1.2.1.25.2.1.2"
_HR_STORAGE_TYPE_FIXED_DISK = "1.3.6.1.2.1.25.2.1.4"

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.snmp_poll.snmp_poll_all_devices")
def snmp_poll_all_devices():
    """Poll all SNMP-enabled devices."""
    db = SyncSessionLocal()
    try:
        devices = db.execute(
            select(Device)
            .where(Device.snmp_enabled == True, Device.maintenance_mode == False)  # noqa: E712
            .options(
                joinedload(Device.snmp_credential),
                joinedload(Device.snmp_template),
            )
        ).scalars().unique().all()

        polled = 0
        for device in devices:
            if not device.snmp_credential:
                continue
            try:
                _poll_single_device(db, device)
                polled += 1
            except Exception:
                logger.exception("SNMP poll failed for device %s", device.name)
                if device.status == DeviceStatus.ONLINE:
                    device.status = DeviceStatus.WARNING
                    device.status_reason = "SNMP"
                    logger.warning("SNMP poll failed for %s, setting WARNING", device.name)
                    from app.services.alert_service import notify_status_change
                    from app.models.alert import AlertSeverity
                    notify_status_change(db, device, AlertSeverity.WARNING, "SNMP poll failed", metric_name="snmp_failure")

        db.commit()
        logger.info("SNMP polled %d devices", polled)

        # Notify WebSocket clients via Redis pub/sub
        if polled > 0:
            try:
                import redis
                from app.config import settings
                r = redis.from_url(str(settings.REDIS_URL))
                r.publish("ws_broadcast", json.dumps({"type": "snmp_update", "polled": polled}))
                r.close()
            except Exception:
                logger.debug("Redis publish for snmp_update failed")

        return {"polled": polled}
    except Exception:
        db.rollback()
        logger.exception("SNMP poll task failed")
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.snmp_poll.snmp_poll_device")
def snmp_poll_device(device_id: int):
    """Poll a single device."""
    db = SyncSessionLocal()
    try:
        device = db.execute(
            select(Device)
            .where(Device.id == device_id)
            .options(
                joinedload(Device.snmp_credential),
                joinedload(Device.snmp_template),
            )
        ).scalar_one_or_none()
        if not device or not device.snmp_credential:
            return
        _poll_single_device(db, device)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _poll_single_device(db, device: Device) -> None:
    """Poll device using its template OIDs and store results."""
    # Auto-assign template if missing
    if device.snmp_template_id is None and device.snmp_credential:
        _auto_assign_template(db, device)

    oids_to_poll = _get_oids_for_device(device)
    if not oids_to_poll:
        return

    results = snmp_get(device.ip_address, device.snmp_credential, list(oids_to_poll.keys()))
    now = datetime.utcnow()

    for oid, value in results.items():
        oid_meta = oids_to_poll.get(oid, {})
        data = SNMPData(
            device_id=device.id,
            oid=oid,
            oid_name=oid_meta.get("name", oid),
            value=str(value),
            value_type=oid_meta.get("type", "gauge"),
            timestamp=now,
        )
        db.add(data)

    # Update device name from sysName if name is still an IP address
    _update_name_from_snmp(device, oids_to_poll, results)

    # Extract OS info from sysDescr if available
    _update_os_info(device, oids_to_poll, results)

    # Compute Cisco memory percent from used/free if available
    _compute_cisco_memory_percent(db, device, oids_to_poll, results, now)

    # HOST-RESOURCES-MIB walk for server templates
    if _template_has_host_resources(device):
        _poll_host_resources(db, device, now)

    # Check UPS battery status and override device status if on battery
    _check_ups_battery_status(db, device, oids_to_poll, results)

    # Check server metric thresholds (CPU, memory, disk)
    _check_server_metrics(db, device)


def _template_has_host_resources(device: Device) -> bool:
    """Check if the device template uses HOST-RESOURCES-MIB walks."""
    if not device.snmp_template or not device.snmp_template.alert_rules:
        return False
    try:
        rules = json.loads(device.snmp_template.alert_rules)
        return bool(rules.get("host_resources"))
    except (json.JSONDecodeError, TypeError):
        return False


def _walk_to_dict(results: list[tuple]) -> dict[str, str]:
    """Convert SNMP walk results to dict keyed by last OID index."""
    out = {}
    for oid, val in results:
        # e.g. "1.3.6.1.2.1.25.2.3.1.2.5" → index "5"
        idx = oid.rsplit(".", 1)[-1]
        out[idx] = str(val)
    return out


def _safe_int(val: str) -> int:
    """Parse string to int, handling floats and non-numeric values."""
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def _poll_host_resources(db, device: Device, now: datetime) -> None:
    """Walk HOST-RESOURCES-MIB tables for CPU, memory, and disk metrics.

    Works on any platform implementing RFC 2790 (Windows, Linux, etc.)
    by dynamically discovering table indices instead of hardcoding them.
    """
    ip = device.ip_address
    cred = device.snmp_credential

    # --- CPU: Walk hrProcessorLoad table ---
    cpu_results = snmp_walk(ip, cred, _HR_PROCESSOR_LOAD)
    if cpu_results:
        values = [_safe_int(v) for _, v in cpu_results if _safe_int(v) >= 0]
        if values:
            avg_cpu = round(sum(values) / len(values), 1)
            db.add(SNMPData(
                device_id=device.id,
                oid=_HR_PROCESSOR_LOAD,
                oid_name="cpuLoadAvg",
                value=str(avg_cpu),
                value_type="gauge",
                timestamp=now,
            ))
            logger.debug("Device %s CPU: %.1f%% (%d cores)", device.name, avg_cpu, len(values))

    # --- Storage: Walk hrStorageTable columns ---
    storage_types = _walk_to_dict(snmp_walk(ip, cred, _HR_STORAGE_TYPE))
    storage_descr = _walk_to_dict(snmp_walk(ip, cred, _HR_STORAGE_DESCR))
    storage_units = _walk_to_dict(snmp_walk(ip, cred, _HR_STORAGE_UNITS))
    storage_size  = _walk_to_dict(snmp_walk(ip, cred, _HR_STORAGE_SIZE))
    storage_used  = _walk_to_dict(snmp_walk(ip, cred, _HR_STORAGE_USED))

    # --- Memory (hrStorageType = hrStorageRam) ---
    for idx, stype in storage_types.items():
        if _HR_STORAGE_TYPE_RAM not in stype:
            continue
        units = _safe_int(storage_units.get(idx, "0"))
        total = _safe_int(storage_size.get(idx, "0"))
        used  = _safe_int(storage_used.get(idx, "0"))
        if total > 0 and units > 0:
            total_bytes = total * units
            used_bytes = used * units
            pct = round(used_bytes / total_bytes * 100, 1)
            db.add(SNMPData(
                device_id=device.id,
                oid=_HR_STORAGE_USED,
                oid_name="memoryUsedPercent",
                value=str(pct),
                value_type="gauge",
                timestamp=now,
            ))
            # Store raw bytes for tooltip/detail display
            db.add(SNMPData(
                device_id=device.id,
                oid=_HR_STORAGE_SIZE,
                oid_name="memoryTotalBytes",
                value=str(total_bytes),
                value_type="gauge",
                timestamp=now,
            ))
            db.add(SNMPData(
                device_id=device.id,
                oid=_HR_STORAGE_USED,
                oid_name="memoryUsedBytes",
                value=str(used_bytes),
                value_type="gauge",
                timestamp=now,
            ))
            descr = storage_descr.get(idx, "Physical Memory")
            logger.debug("Device %s Memory (%s): %.1f%% (%s / %s)",
                         device.name, descr, pct,
                         _format_bytes(used_bytes), _format_bytes(total_bytes))
        break  # Only first RAM entry

    # --- Disk (hrStorageType = hrStorageFixedDisk) ---
    disk_entries = []
    for idx, stype in storage_types.items():
        if _HR_STORAGE_TYPE_FIXED_DISK not in stype:
            continue
        units = _safe_int(storage_units.get(idx, "0"))
        total = _safe_int(storage_size.get(idx, "0"))
        used  = _safe_int(storage_used.get(idx, "0"))
        if total > 0 and units > 0:
            total_bytes = total * units
            used_bytes = used * units
            pct = round(used_bytes / total_bytes * 100, 1)
            descr = storage_descr.get(idx, f"disk_{idx}")
            disk_entries.append((descr, pct, total_bytes, used_bytes))

    if disk_entries:
        # Store per-disk metrics
        for descr, pct, total_bytes, used_bytes in disk_entries:
            # Sanitize description for use as metric name suffix
            safe = descr.replace("\\", "").replace(":", "").replace("/", "_").strip()
            if not safe:
                safe = "root"
            db.add(SNMPData(
                device_id=device.id,
                oid=_HR_STORAGE_USED,
                oid_name=f"diskUsedPercent_{safe}",
                value=str(pct),
                value_type="gauge",
                timestamp=now,
            ))
            db.add(SNMPData(
                device_id=device.id,
                oid=_HR_STORAGE_SIZE,
                oid_name=f"diskTotalBytes_{safe}",
                value=str(total_bytes),
                value_type="gauge",
                timestamp=now,
            ))

        # Store headline disk metric (worst utilization across all disks)
        worst = max(disk_entries, key=lambda x: x[1])
        db.add(SNMPData(
            device_id=device.id,
            oid=_HR_STORAGE_USED,
            oid_name="diskUsedPercent",
            value=str(worst[1]),
            value_type="gauge",
            timestamp=now,
        ))
        logger.debug("Device %s Disks: %s",
                      device.name,
                      ", ".join(f"{d}: {p}%" for d, p, _, _ in disk_entries))


def _format_bytes(b: int) -> str:
    """Format bytes as human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(b) < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


def _auto_assign_template(db, device: Device) -> None:
    """Probe sysObjectID/sysDescr and assign matching template."""
    from app.services.snmp_service import SYS_DESCR, SYS_OBJECT_ID
    from app.services.template_loader import find_matching_template

    try:
        result = snmp_get(device.ip_address, device.snmp_credential, [SYS_DESCR, SYS_OBJECT_ID])
        if not result:
            return
        sys_descr = result.get(SYS_DESCR, "")
        sys_object_id = result.get(SYS_OBJECT_ID, "")
        dtype = device.device_type.value if device.device_type else None

        tmpl = find_matching_template(db, sys_descr, sys_object_id, dtype)
        if tmpl:
            device.snmp_template_id = tmpl.id
            # Refresh the relationship so _get_oids_for_device sees it
            db.flush()
            db.refresh(device)
            logger.info("Auto-assigned template '%s' to device %s", tmpl.name, device.name)
    except Exception:
        logger.debug("Template auto-assignment failed for %s", device.name)


def _update_name_from_snmp(device: Device, oids_to_poll: dict, results: dict) -> None:
    """Update device name from sysName/sysDescr if the current name is an IP or matches the SNMP credential username."""
    import ipaddress as _ipaddress
    needs_update = False
    # Check if name is an IP address
    try:
        _ipaddress.ip_address(device.name)
        needs_update = True
    except ValueError:
        pass
    # Check if name matches SNMP credential username (common mis-assignment from discovery)
    cred_user = None
    if device.snmp_credential:
        cred_user = getattr(device.snmp_credential, "username", None)
    if not needs_update and cred_user and device.name == cred_user:
        needs_update = True
    if not needs_update:
        return

    # Collect sysName, lldpLocSysName, and sysDescr from poll results
    sys_name = None
    lldp_name = None
    sys_descr = None
    for oid, value in results.items():
        oid_name = oids_to_poll.get(oid, {}).get("name", "")
        if oid_name == "sysName" and value:
            sys_name = str(value).strip()
        elif oid_name == "lldpLocSysName" and value:
            lldp_name = str(value).strip()
        elif oid_name in ("sysDescr", "sysDescription") and value:
            sys_descr = str(value).strip()

    # Prefer LLDP local system name (often the real configured hostname)
    if lldp_name and lldp_name != device.ip_address and lldp_name != cred_user:
        logger.info("Updated device name from LLDP: %s -> %s", device.name, lldp_name)
        device.name = lldp_name
        return

    # Use sysName if it's a real hostname (not the SNMP username and not an IP)
    if sys_name and sys_name != device.ip_address and sys_name != cred_user:
        logger.info("Updated device name from SNMP sysName: %s -> %s", device.name, sys_name)
        device.name = sys_name
        return

    # Fallback: extract model from sysDescr (e.g., "Juniper Networks, Inc. ex4100-f-48p ...")
    if sys_descr:
        new_name = _extract_name_from_descr(sys_descr, device.ip_address)
        if new_name:
            logger.info("Updated device name from sysDescr: %s -> %s", device.name, new_name)
            device.name = new_name


def _extract_name_from_descr(sys_descr: str, ip_address: str) -> str | None:
    """Extract a device model/name from sysDescr string."""
    descr_lower = sys_descr.lower()
    # Juniper: "Juniper Networks, Inc. ex4100-f-48p Ethernet Switch, kernel JUNOS ..."
    if "juniper" in descr_lower:
        parts = sys_descr.split()
        for part in parts:
            p = part.lower().rstrip(",")
            if any(p.startswith(prefix) for prefix in ("ex", "qfx", "srx", "mx", "ptx", "acx")):
                # Use model + last octet of IP for uniqueness
                last_octet = ip_address.rsplit(".", 1)[-1]
                return f"{part.rstrip(',')}-{last_octet}"
    # Cisco: "Cisco IOS Software, C2960S ..."
    if "cisco" in descr_lower:
        parts = sys_descr.split()
        for i, part in enumerate(parts):
            p = part.lower().rstrip(",")
            if p.startswith("c") and any(c.isdigit() for c in p):
                last_octet = ip_address.rsplit(".", 1)[-1]
                return f"{part.rstrip(',')}-{last_octet}"
    return None


def _update_os_info(device: Device, oids_to_poll: dict, results: dict) -> None:
    """Extract OS info from sysDescr and store on device."""
    if device.os_info:
        return  # Already set
    from app.services.snmp_service import _extract_os_info, snmp_get, SYS_DESCR
    # First check if sysDescr is in the polled results
    sys_descr = None
    for oid, value in results.items():
        name = oids_to_poll.get(oid, {}).get("name", "")
        if name in ("sysDescr", "sysDescription"):
            sys_descr = str(value)
            break
    # If not in template results, do a one-off fetch
    if not sys_descr and device.snmp_credential:
        try:
            r = snmp_get(device.ip_address, device.snmp_credential, [SYS_DESCR])
            sys_descr = r.get(SYS_DESCR)
        except Exception:
            pass
    if sys_descr:
        os_info = _extract_os_info(sys_descr)
        if os_info:
            device.os_info = os_info


def _compute_cisco_memory_percent(db, device: Device, oids_to_poll: dict, results: dict, now) -> None:
    """Compute ciscoMemoryUsedPercent from ciscoMemoryPoolUsed + ciscoMemoryPoolFree."""
    used_val = free_val = None
    for oid, value in results.items():
        name = oids_to_poll.get(oid, {}).get("name", "")
        if name == "ciscoMemoryPoolUsed":
            used_val = _safe_int(str(value))
        elif name == "ciscoMemoryPoolFree":
            free_val = _safe_int(str(value))
    if used_val is not None and free_val is not None and (used_val + free_val) > 0:
        pct = round(used_val / (used_val + free_val) * 100, 1)
        db.add(SNMPData(
            device_id=device.id,
            oid="computed",
            oid_name="ciscoMemoryUsedPercent",
            value=str(pct),
            value_type="gauge",
            timestamp=now,
        ))
        logger.debug("Device %s Cisco memory: %.1f%%", device.name, pct)


def _check_ups_battery_status(db, device: Device, oids_to_poll: dict, results: dict) -> None:
    """Override device status if UPS battery status indicates on-battery or low.
    Auto-resolve alerts when conditions return to normal."""
    from app.services.alert_service import auto_resolve_alerts, notify_status_change
    from app.models.alert import Alert, AlertStatus

    dtype = device.device_type.value if device.device_type else None
    if dtype != "ups":
        return

    battery_problem = False
    on_battery = False

    # Check battery health (low/depleted)
    for oid, value in results.items():
        oid_name = oids_to_poll.get(oid, {}).get("name", "")
        if oid_name not in _UPS_BATTERY_STATUS_OIDS:
            continue
        try:
            status_val = int(float(str(value)))
        except (ValueError, TypeError):
            continue

        if status_val >= 4:
            prev = device.status
            device.status = DeviceStatus.OFFLINE
            device.status_reason = "Battery Depleted"
            battery_problem = True
            logger.warning("UPS %s battery depleted (status=%d), setting OFFLINE", device.name, status_val)
            if prev != DeviceStatus.OFFLINE:
                from app.models.alert import AlertSeverity as _Sev
                notify_status_change(db, device, _Sev.CRITICAL, "Battery Depleted", metric_name="ups_battery")
        elif status_val == 3:
            prev = device.status
            device.status = DeviceStatus.OFFLINE
            device.status_reason = "Battery Low"
            battery_problem = True
            logger.warning("UPS %s battery low (status=%d), setting OFFLINE", device.name, status_val)
            if prev != DeviceStatus.OFFLINE:
                from app.models.alert import AlertSeverity as _Sev
                notify_status_change(db, device, _Sev.CRITICAL, "Battery Low", metric_name="ups_battery")
        elif status_val == 1:
            prev = device.status
            device.status = DeviceStatus.WARNING
            device.status_reason = "Battery Unknown"
            battery_problem = True
            logger.info("UPS %s battery status unknown (status=%d), setting WARNING", device.name, status_val)
            if prev == DeviceStatus.ONLINE:
                from app.models.alert import AlertSeverity as _Sev
                notify_status_change(db, device, _Sev.WARNING, "Battery Unknown", metric_name="ups_battery")
        else:
            # Battery normal — auto-resolve battery health alerts
            auto_resolve_alerts(db, device.id, "upsBasicBatteryStatus")
            auto_resolve_alerts(db, device.id, "upsBatteryStatus")
        break

    if battery_problem:
        return

    # Collect input voltage to cross-check on-battery status
    input_voltage = None
    for oid, value in results.items():
        oid_name = oids_to_poll.get(oid, {}).get("name", "")
        if oid_name == "upsAdvInputLineVoltage":
            try:
                input_voltage = float(str(value))
            except (ValueError, TypeError):
                pass
            break

    # Check output source — detect "on battery" even when battery health is normal
    for oid, value in results.items():
        oid_name = oids_to_poll.get(oid, {}).get("name", "")
        if oid_name not in _UPS_OUTPUT_SOURCE_OIDS:
            continue
        try:
            source_val = int(float(str(value)))
        except (ValueError, TypeError):
            continue

        if oid_name == "upsBasicOutputStatus":
            on_battery = source_val == 3
        elif oid_name == "upsOutputSource":
            on_battery = source_val == 5

        # Cross-check: if input voltage is present and normal, UPS has mains power
        # despite what the output status reports (common APC NMC firmware issue)
        if on_battery and input_voltage is not None and input_voltage > 90:
            logger.info(
                "UPS %s reports on-battery (source=%d) but input voltage is %.0fV — "
                "ignoring false on-battery status", device.name, source_val, input_voltage
            )
            on_battery = False

        if on_battery:
            prev = device.status
            device.status = DeviceStatus.WARNING
            device.status_reason = "On Battery"
            logger.warning("UPS %s is on battery power (source=%d), setting WARNING", device.name, source_val)
            if prev == DeviceStatus.ONLINE:
                from app.models.alert import AlertSeverity as _Sev
                notify_status_change(db, device, _Sev.WARNING, "On Battery", metric_name="ups_on_battery")
        else:
            # Back on line power — auto-resolve on-battery alerts
            auto_resolve_alerts(db, device.id, "upsBasicOutputStatus")
            auto_resolve_alerts(db, device.id, "upsOutputSource")
            logger.info("UPS %s back on line power (source=%d)", device.name, source_val)
        break

    # If no battery or output source problems detected, ensure device is cleared
    # to ONLINE when no active alerts remain (fixes stuck WARNING from prior direct
    # status overrides that weren't backed by an alert object)
    if not battery_problem and not on_battery:
        remaining = db.execute(
            select(func.count(Alert.id)).where(
                Alert.device_id == device.id,
                Alert.status == AlertStatus.ACTIVE,
            )
        ).scalar() or 0
        if remaining == 0 and device.status == DeviceStatus.WARNING:
            device.status = DeviceStatus.ONLINE
            device.status_reason = None
            logger.info("UPS %s all clear, resetting to ONLINE", device.name)


def _check_server_metrics(db, device: Device) -> None:
    """Check latest CPU, memory, disk metrics against thresholds and set status."""
    from app.config import settings

    dtype = device.device_type.value if device.device_type else None
    if dtype not in ("server", "router", "switch"):
        return

    # Only override if device is currently ONLINE (don't mask a worse status)
    if device.status not in (DeviceStatus.ONLINE, DeviceStatus.WARNING):
        return

    # Get latest metric values from this poll cycle
    from sqlalchemy import select as sel
    latest_metrics = {}
    for metric_name in ("cpuLoadAvg", "memoryUsedPercent", "diskUsedPercent"):
        row = db.execute(
            sel(SNMPData)
            .where(SNMPData.device_id == device.id, SNMPData.oid_name == metric_name)
            .order_by(SNMPData.timestamp.desc())
            .limit(1)
        ).scalar_one_or_none()
        if row:
            try:
                latest_metrics[metric_name] = float(row.value)
            except (ValueError, TypeError):
                pass

    # Parse per-device alert exclusions
    import json as _json
    excluded = set()
    if device.alert_excluded_metrics:
        try:
            excluded = set(_json.loads(device.alert_excluded_metrics))
        except (ValueError, TypeError):
            pass

    reasons = []

    checks = [
        ("cpuLoadAvg", settings.CPU_WARNING_PERCENT, "CPU"),
        ("memoryUsedPercent", settings.MEMORY_WARNING_PERCENT, "Memory"),
        ("diskUsedPercent", settings.DISK_WARNING_PERCENT, "Disk"),
    ]
    for metric_name, warn_pct, label in checks:
        if metric_name in excluded:
            continue
        val = latest_metrics.get(metric_name)
        if val is None:
            continue
        if val >= warn_pct:
            reasons.append(f"{label} {val:.0f}%")
            logger.info("Device %s %s at %.1f%% (>=%d%%), setting WARNING",
                        device.name, label, val, warn_pct)

    if reasons:
        prev = device.status
        device.status = DeviceStatus.WARNING
        device.status_reason = ", ".join(reasons)
        if prev == DeviceStatus.ONLINE:
            from app.services.alert_service import notify_status_change
            from app.models.alert import AlertSeverity as _Sev
            notify_status_change(db, device, _Sev.WARNING, ", ".join(reasons), metric_name="server_metrics")
    elif device.status == DeviceStatus.WARNING and device.status_reason:
        # All triggering metrics are now excluded or below threshold — resolve
        from app.services.alert_service import auto_resolve_alerts
        auto_resolve_alerts(db, device.id, "server_metrics")
        from sqlalchemy import select as sel2
        from app.models.alert import Alert as _Alert, AlertStatus as _AS
        remaining = db.execute(
            sel2(func.count(_Alert.id)).where(
                _Alert.device_id == device.id,
                _Alert.status == _AS.ACTIVE,
            )
        ).scalar() or 0
        if remaining == 0:
            device.status = DeviceStatus.ONLINE
            device.status_reason = None


def _get_oids_for_device(device: Device) -> dict:
    """Get OIDs to poll from device template config."""
    # Default basic OIDs if no template
    default_oids = {
        "1.3.6.1.2.1.1.1.0": {"name": "sysDescr", "type": "string"},
        "1.3.6.1.2.1.1.3.0": {"name": "sysUpTime", "type": "timeticks"},
        "1.3.6.1.2.1.1.5.0": {"name": "sysName", "type": "string"},
    }
    if not device.snmp_template or not device.snmp_template.oid_config:
        return default_oids
    try:
        return json.loads(device.snmp_template.oid_config)
    except (json.JSONDecodeError, TypeError):
        return default_oids
