# SPDX-License-Identifier: GPL-3.0-or-later
"""
SNMP trap receiver using pysnmp.
"""
import logging
from datetime import datetime

from pysnmp.entity import engine, config
from pysnmp.carrier.asyncore.dgram import udp
from pysnmp.entity.rfc3413 import ntfrcv

from app.database import SyncSessionLocal
from app.models.syslog import SNMPTrap
from app.models.device import Device
from sqlalchemy import select

logger = logging.getLogger(__name__)


def _trap_callback(snmp_engine, state_reference, context_engine_id,
                   context_name, var_binds, cb_ctx):
    """Callback invoked for each received trap."""
    transport_domain, transport_address = snmp_engine.msgAndPduDsp.getTransportInfo(
        state_reference
    )
    source_ip = transport_address[0] if transport_address else "unknown"

    db = SyncSessionLocal()
    try:
        # Find device
        result = db.execute(select(Device.id).where(Device.ip_address == source_ip))
        row = result.first()
        device_id = row[0] if row else None

        for oid, val in var_binds:
            trap = SNMPTrap(
                device_id=device_id,
                source_ip=source_ip,
                oid=str(oid),
                value=str(val),
                timestamp=datetime.utcnow(),
            )
            db.add(trap)
        db.commit()
        logger.info("Trap received from %s: %d varbinds", source_ip, len(var_binds))
    except Exception:
        db.rollback()
        logger.exception("Failed to store trap from %s", source_ip)
    finally:
        db.close()


def start_trap_receiver(host: str = "0.0.0.0", port: int = 162) -> None:
    """Start the SNMP trap receiver (blocking)."""
    snmp_engine = engine.SnmpEngine()

    config.addTransport(
        snmp_engine,
        udp.domainName + (1,),
        udp.UdpTransport().openServerMode((host, port)),
    )
    config.addV1System(snmp_engine, "my-area", "public")

    ntfrcv.NotificationReceiver(snmp_engine, _trap_callback)

    logger.info("SNMP trap receiver listening on %s:%d", host, port)
    snmp_engine.transportDispatcher.jobStarted(1)
    try:
        snmp_engine.transportDispatcher.runDispatcher()
    except Exception:
        snmp_engine.transportDispatcher.closeDispatcher()
        raise
