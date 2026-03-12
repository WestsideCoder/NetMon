# SPDX-License-Identifier: GPL-3.0-or-later
"""
TimescaleDB hypertable setup, continuous aggregates, and retention policies.
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

HYPERTABLES = [
    ("snmp_data", "timestamp"),
    ("status_history", "timestamp"),
    ("syslog_entries", "timestamp"),
    ("snmp_traps", "timestamp"),
]


async def setup_timescaledb(session: AsyncSession) -> None:
    """Create TimescaleDB extension and convert tables to hypertables."""
    try:
        await session.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE"))
        await session.commit()
    except Exception:
        await session.rollback()
        logger.warning("TimescaleDB extension not available, skipping hypertable setup")
        return

    for table, time_col in HYPERTABLES:
        try:
            await session.execute(text("SET LOCAL statement_timeout = '10s'"))
            await session.execute(
                text(
                    f"SELECT create_hypertable('{table}', '{time_col}', "
                    f"if_not_exists => TRUE, migrate_data => TRUE)"
                )
            )
            await session.commit()
            logger.info("Hypertable created/verified: %s", table)
        except Exception:
            await session.rollback()
            logger.warning("Could not create hypertable for %s", table)

    # Retention policies: raw 90 days
    for table, _ in HYPERTABLES:
        try:
            await session.execute(
                text(
                    f"SELECT add_retention_policy('{table}', INTERVAL '90 days', "
                    f"if_not_exists => TRUE)"
                )
            )
            await session.commit()
        except Exception:
            await session.rollback()

    # Compression on snmp_data after 7 days
    try:
        await session.execute(
            text(
                "ALTER TABLE snmp_data SET ("
                "timescaledb.compress, "
                "timescaledb.compress_segmentby = 'device_id', "
                "timescaledb.compress_orderby = 'timestamp DESC')"
            )
        )
        await session.commit()
        await session.execute(
            text(
                "SELECT add_compression_policy('snmp_data', INTERVAL '7 days', "
                "if_not_exists => TRUE)"
            )
        )
        await session.commit()
    except Exception:
        await session.rollback()
        logger.warning("Could not set compression policy for snmp_data")
