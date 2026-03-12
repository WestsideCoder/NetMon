# SPDX-License-Identifier: GPL-3.0-or-later
"""
Syslog UDP receiver and parser (RFC 3164/5424).
"""
import logging
import re
import socketserver
from datetime import datetime
from typing import Optional

from app.database import SyncSessionLocal
from app.models.syslog import SyslogEntry
from app.models.device import Device
from sqlalchemy import select

logger = logging.getLogger(__name__)

# RFC 3164 PRI pattern
PRI_PATTERN = re.compile(r"<(\d{1,3})>(.*)")


def parse_syslog_message(data: str) -> dict:
    """Parse a syslog message into facility, severity, and message."""
    match = PRI_PATTERN.match(data)
    if not match:
        return {"facility": 0, "severity": 6, "message": data}
    pri = int(match.group(1))
    facility = pri >> 3
    severity = pri & 0x07
    message = match.group(2).strip()
    return {"facility": facility, "severity": severity, "message": message}


def lookup_device_by_ip(db, ip: str) -> Optional[int]:
    """Find device_id by source IP."""
    result = db.execute(select(Device.id).where(Device.ip_address == ip))
    row = result.first()
    return row[0] if row else None


class SyslogHandler(socketserver.BaseRequestHandler):
    """UDP syslog message handler."""

    def handle(self):
        data = self.request[0].decode("utf-8", errors="replace").strip()
        source_ip = self.client_address[0]

        parsed = parse_syslog_message(data)

        db = SyncSessionLocal()
        try:
            device_id = lookup_device_by_ip(db, source_ip)
            entry = SyslogEntry(
                device_id=device_id,
                source_ip=source_ip,
                facility=parsed["facility"],
                severity=parsed["severity"],
                message=parsed["message"],
                timestamp=datetime.utcnow(),
            )
            db.add(entry)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to store syslog entry from %s", source_ip)
        finally:
            db.close()


def start_syslog_server(host: str = "0.0.0.0", port: int = 514) -> None:
    """Start the syslog UDP listener (blocking)."""
    server = socketserver.UDPServer((host, port), SyslogHandler)
    logger.info("Syslog server listening on %s:%d", host, port)
    server.serve_forever()
