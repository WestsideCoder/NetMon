# SPDX-License-Identifier: GPL-3.0-or-later
"""
Ping monitoring task using fping.
"""
import ipaddress
import logging
import struct
import subprocess
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.tasks import celery_app
from app.database import SyncSessionLocal
from app.models.device import Device, DeviceStatus
from app.models.alert import StatusHistory, Alert, AlertStatus, AlertSeverity
from app.config import settings

logger = logging.getLogger(__name__)


def _try_dns_name(device) -> None:
    """Try to resolve device name via DNS reverse lookup if name is still an IP."""
    try:
        ipaddress.ip_address(device.name)
    except ValueError:
        return  # Name is not an IP — already has a real name

    dns_servers = [s.strip() for s in settings.DNS_SERVERS.split(",") if s.strip()]
    if dns_servers:
        _dns_lookup_custom(device, dns_servers)
    else:
        _dns_lookup_system(device)


def _dns_lookup_system(device) -> None:
    """Reverse DNS using system resolver."""
    import socket
    try:
        hostname, _, _ = socket.gethostbyaddr(device.ip_address)
        if hostname and hostname != device.ip_address:
            logger.info("Updated device name from DNS: %s -> %s", device.name, hostname)
            device.name = hostname
    except (socket.herror, socket.gaierror, OSError):
        pass


def _dns_lookup_custom(device, dns_servers: list[str]) -> None:
    """Reverse DNS using configured DNS servers via UDP query."""
    import socket
    import struct

    # Build a simple PTR query
    ip_parts = device.ip_address.split(".")
    ptr_name = ".".join(reversed(ip_parts)) + ".in-addr.arpa"

    # Construct DNS query packet
    txn_id = 0x1234
    flags = 0x0100  # standard query, recursion desired
    questions = 1
    header = struct.pack("!HHHHHH", txn_id, flags, questions, 0, 0, 0)

    # Encode the PTR name
    query = b""
    for label in ptr_name.split("."):
        query += struct.pack("B", len(label)) + label.encode()
    query += b"\x00"
    query += struct.pack("!HH", 12, 1)  # QTYPE=PTR, QCLASS=IN

    packet = header + query

    for server in dns_servers:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2)
            sock.sendto(packet, (server, 53))
            data, _ = sock.recvfrom(1024)
            sock.close()

            # Parse response
            answer_count = struct.unpack("!H", data[6:8])[0]
            if answer_count == 0:
                continue

            # Skip header (12 bytes) and question section
            offset = 12
            # Skip question name
            while data[offset] != 0:
                if data[offset] & 0xC0 == 0xC0:
                    offset += 2
                    break
                offset += data[offset] + 1
            else:
                offset += 1
            offset += 4  # QTYPE + QCLASS

            # Parse first answer
            # Skip name (may be compressed)
            if data[offset] & 0xC0 == 0xC0:
                offset += 2
            else:
                while data[offset] != 0:
                    offset += data[offset] + 1
                offset += 1

            rtype = struct.unpack("!H", data[offset:offset+2])[0]
            offset += 8  # type(2) + class(2) + ttl(4)
            rdlength = struct.unpack("!H", data[offset:offset+2])[0]
            offset += 2

            if rtype == 12:  # PTR record
                # Decode PTR name
                hostname = _decode_dns_name(data, offset)
                if hostname and hostname != device.ip_address:
                    # Remove trailing dot
                    hostname = hostname.rstrip(".")
                    logger.info("Updated device name from DNS: %s -> %s", device.name, hostname)
                    device.name = hostname
                return
        except Exception:
            continue


def _decode_dns_name(data: bytes, offset: int) -> str:
    """Decode a DNS name from a response packet, handling compression."""
    labels = []
    seen = set()
    while offset < len(data):
        if offset in seen:
            break
        seen.add(offset)
        length = data[offset]
        if length == 0:
            break
        if length & 0xC0 == 0xC0:
            pointer = struct.unpack("!H", data[offset:offset+2])[0] & 0x3FFF
            labels.append(_decode_dns_name(data, pointer))
            break
        offset += 1
        labels.append(data[offset:offset+length].decode("ascii", errors="replace"))
        offset += length
    return ".".join(labels)


def _is_valid_ip(ip: str) -> bool:
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


def _run_fping(ips: list[str]) -> dict[str, dict]:
    """Run fping and parse results. Returns {ip: {alive: bool, rtt: float|None}}."""
    if not ips:
        return {}
    # Validate IPs before passing to subprocess
    ips = [ip for ip in ips if _is_valid_ip(ip)]
    if not ips:
        return {}
    try:
        proc = subprocess.run(
            ["fping", "-c", "3", "-q", "-t", "500"] + ips,
            capture_output=True,
            text=True,
            timeout=30 + len(ips) * 0.1,
        )
        results = {}
        for line in proc.stderr.splitlines():
            if ":" not in line:
                continue
            ip = line.split(":")[0].strip()
            if "min/avg/max" in line:
                try:
                    avg = float(line.split("min/avg/max = ")[1].split("/")[1])
                    results[ip] = {"alive": True, "rtt": avg}
                except (IndexError, ValueError):
                    results[ip] = {"alive": True, "rtt": None}
            else:
                results[ip] = {"alive": False, "rtt": None}
        return results
    except FileNotFoundError:
        logger.warning("fping not installed, using icmplib fallback")
        return _icmplib_fallback(ips)
    except subprocess.TimeoutExpired:
        logger.error("fping timed out for %d hosts", len(ips))
        return {}


def _icmplib_fallback(ips: list[str]) -> dict[str, dict]:
    """Fallback to icmplib when fping is not available."""
    try:
        from icmplib import multiping
        results = {}
        hosts = multiping(ips, count=3, timeout=2, privileged=False)
        for host in hosts:
            results[host.address] = {
                "alive": host.is_alive,
                "rtt": host.avg_rtt if host.is_alive else None,
            }
        return results
    except Exception:
        logger.exception("icmplib fallback failed")
        return {}


@celery_app.task(name="app.tasks.ping.ping_all_devices")
def ping_all_devices():
    """Celery task: ping all active, non-maintenance devices."""
    db = SyncSessionLocal()
    try:
        devices = db.execute(
            select(Device).options(joinedload(Device.site)).where(
                Device.maintenance_mode == False  # noqa: E712
            )
        ).scalars().unique().all()

        if not devices:
            return {"pinged": 0}

        ip_to_device = {d.ip_address: d for d in devices}
        ips = list(ip_to_device.keys())

        # Process in batches of 500 for fping
        batch_size = 500
        total_updated = 0
        for i in range(0, len(ips), batch_size):
            batch = ips[i : i + batch_size]
            results = _run_fping(batch)

            for ip, ping_result in results.items():
                device = ip_to_device.get(ip)
                if not device:
                    continue
                _update_device_status(db, device, ping_result)
                total_updated += 1

            # Also mark devices with no ping result
            for ip in batch:
                if ip not in results:
                    device = ip_to_device.get(ip)
                    if device:
                        _update_device_status(
                            db, device, {"alive": False, "rtt": None}
                        )
                        total_updated += 1

        db.commit()
        logger.info("Pinged %d devices", total_updated)

        # Broadcast ping complete so frontends refresh
        try:
            import json
            from app.core.celery_app import celery_app as _capp
            r = _capp.backend.client if hasattr(_capp.backend, 'client') else None
            if r is None:
                import redis
                from app.config import settings as _s
                r = redis.Redis.from_url(_s.REDIS_URL)
            r.publish("ws_broadcast", json.dumps({"type": "ping_update", "pinged": total_updated}))
        except Exception:
            logger.debug("Failed to publish ping_update to WS", exc_info=True)

        return {"pinged": total_updated}
    except Exception:
        db.rollback()
        logger.exception("Ping task failed")
        raise
    finally:
        db.close()


def _update_device_status(db, device: Device, ping_result: dict) -> None:
    """Update device status based on ping result."""
    # Skip devices in maintenance mode (should be filtered upstream, but guard)
    if device.maintenance_mode:
        return

    now = datetime.utcnow()
    prev_status = device.status
    device.last_check = now
    device.total_checks += 1

    # Try DNS reverse lookup if name is still an IP address
    _try_dns_name(device)

    if ping_result["alive"]:
        device.response_time = ping_result["rtt"]
        device.last_seen = now
        device.successful_checks += 1
        was_down = prev_status in (DeviceStatus.OFFLINE, DeviceStatus.WARNING)

        if was_down:
            # Track consecutive successes for recovery confirmation
            device.consecutive_successes = getattr(device, 'consecutive_successes', 0) + 1

            recovery_pings = settings.RECOVERY_PINGS or 3
            if device.consecutive_successes >= recovery_pings:
                # Confirmed recovery — resolve alerts and go online
                device.consecutive_failures = 0
                device.consecutive_successes = 0
                ping_alerts = db.execute(
                    select(Alert).where(
                        Alert.device_id == device.id,
                        Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
                        Alert.metric_name.in_(["ping_offline", "consecutive_failures"]),
                    )
                ).scalars().all()
                for alert in ping_alerts:
                    alert.status = AlertStatus.RESOLVED
                    alert.resolved_at = now

                active_alerts = db.execute(
                    select(func.count(Alert.id)).where(
                        Alert.device_id == device.id,
                        Alert.status == AlertStatus.ACTIVE,
                    )
                ).scalar() or 0
                if active_alerts == 0:
                    device.status = DeviceStatus.ONLINE
                    device.status_reason = None

                # Send recovery notification if enabled
                if settings.RECOVERY_EMAIL_ENABLED:
                    from app.services.alert_service import notify_recovery
                    notify_recovery(db, device)
            # else: still recovering, keep current WARNING/OFFLINE status
        else:
            # Already online — reset counters
            device.consecutive_failures = 0
            device.consecutive_successes = 0
    else:
        device.consecutive_failures += 1
        device.consecutive_successes = 0
        device.response_time = None
        if device.consecutive_failures >= settings.MISSED_PINGS_CRITICAL:
            device.status = DeviceStatus.OFFLINE
            device.status_reason = "Ping"
        elif device.consecutive_failures >= settings.MISSED_PINGS_WARNING:
            device.status = DeviceStatus.WARNING
            device.status_reason = "Ping"

    # Record status history
    history = StatusHistory(
        device_id=device.id,
        status=device.status.value,
        response_time=ping_result.get("rtt"),
        timestamp=now,
    )
    db.add(history)

    # Send notifications on transition to WARNING or OFFLINE
    if device.status in (DeviceStatus.WARNING, DeviceStatus.OFFLINE) and device.status != prev_status:
        from app.services.alert_service import notify_status_change
        severity = AlertSeverity.CRITICAL if device.status == DeviceStatus.OFFLINE else AlertSeverity.WARNING
        notify_status_change(db, device, severity, device.status_reason or "Ping", metric_name="ping_offline")
