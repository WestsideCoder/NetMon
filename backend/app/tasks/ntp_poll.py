# SPDX-License-Identifier: GPL-3.0-or-later
"""
NTP polling Celery task — monitors NTP servers for stratum, offset, and reachability.
"""
import logging
import socket
import struct
import time
from datetime import datetime, timezone

from sqlalchemy import select

from app.tasks import celery_app
from app.database import SyncSessionLocal
from app.models.device import Device, DeviceStatus

logger = logging.getLogger(__name__)

# NTP epoch is 1900-01-01, Unix epoch is 1970-01-01
_NTP_DELTA = 2208988800


def _query_ntp(ip: str, timeout: float = 5.0) -> dict:
    """Send NTPv4 client request and parse the response.

    Returns dict with keys: success, stratum, reference_id, offset_ms, rtt_ms,
    server_time, error.
    """
    # NTPv4 client request: LI=0, VN=4, Mode=3 → byte 0 = 0b00_100_011 = 0x23
    packet = b"\x23" + 47 * b"\x00"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        t1 = time.time()  # originate timestamp (T1)
        t1_mono = time.monotonic()
        sock.sendto(packet, (ip, 123))
        resp, _ = sock.recvfrom(1024)
        t4 = time.time()  # destination timestamp (T4)
        rtt_ms = round((time.monotonic() - t1_mono) * 1000, 2)

        if len(resp) < 48:
            return {"success": False, "error": "Response too short"}

        # Parse header
        li_vn_mode = resp[0]
        stratum = resp[1]
        # poll = resp[2]  # not needed
        # precision = struct.unpack("!b", resp[3:4])[0]  # not needed

        # Reference ID (bytes 12-15): for stratum 1, this is a 4-char ASCII code
        ref_id_raw = resp[12:16]
        if stratum <= 1:
            # ASCII reference identifier (e.g. GPS, PPS, ATOM, CDMA)
            reference_id = ref_id_raw.rstrip(b"\x00").decode("ascii", errors="replace")
        else:
            # For stratum 2+, it's the IP of the reference server
            reference_id = ".".join(str(b) for b in ref_id_raw)

        # Extract timestamps (T2 = receive, T3 = transmit)
        def _ntp_to_unix(offset):
            int_part = struct.unpack("!I", resp[offset:offset + 4])[0]
            frac_part = struct.unpack("!I", resp[offset + 4:offset + 8])[0]
            return (int_part - _NTP_DELTA) + frac_part / 2**32

        t2 = _ntp_to_unix(32)  # receive timestamp
        t3 = _ntp_to_unix(40)  # transmit timestamp

        # Clock offset: ((T2 - T1) + (T3 - T4)) / 2
        offset_sec = ((t2 - t1) + (t3 - t4)) / 2
        offset_ms = round(offset_sec * 1000, 3)

        server_time = datetime.fromtimestamp(t3, tz=timezone.utc).isoformat()

        return {
            "success": True,
            "stratum": stratum,
            "reference_id": reference_id,
            "offset_ms": offset_ms,
            "rtt_ms": rtt_ms,
            "server_time": server_time,
        }
    except socket.timeout:
        return {"success": False, "error": "Timeout"}
    except OSError as e:
        return {"success": False, "error": str(e)}
    finally:
        sock.close()


@celery_app.task(name="app.tasks.ntp_poll.ntp_poll_all_devices")
def ntp_poll_all_devices():
    """Celery task: poll all NTP-enabled, non-maintenance devices."""
    db = SyncSessionLocal()
    try:
        devices = db.execute(
            select(Device).where(
                Device.ntp_enabled == True,  # noqa: E712
                Device.maintenance_mode == False,  # noqa: E712
            )
        ).scalars().all()

        if not devices:
            return {"polled": 0}

        polled = 0
        for device in devices:
            result = _query_ntp(device.ip_address)
            _update_ntp_status(device, result)
            polled += 1

        db.commit()
        logger.info("NTP polled %d devices", polled)
        return {"polled": polled}
    except Exception:
        db.rollback()
        logger.exception("NTP poll task failed")
        raise
    finally:
        db.close()


def _update_ntp_status(device: Device, result: dict) -> None:
    """Update device NTP fields from poll result."""
    if result["success"]:
        device.ntp_offset_ms = result["offset_ms"]
        device.ntp_rtt_ms = result["rtt_ms"]
        device.ntp_server_time = result["server_time"]
        device.ntp_stratum = result["stratum"]
        device.ntp_reference_id = result["reference_id"]
        device.ntp_consecutive_failures = 0
    else:
        device.ntp_consecutive_failures += 1
        logger.warning("NTP poll failed for %s (%s): %s",
                        device.name, device.ip_address, result.get("error"))
