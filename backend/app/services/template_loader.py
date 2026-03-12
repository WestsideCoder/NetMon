# SPDX-License-Identifier: GPL-3.0-or-later
"""
Load SNMP device templates from YAML files.
"""
import json
import logging
import os
from typing import Optional

import yaml

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates", "snmp")


def load_templates() -> list[dict]:
    """Load all YAML templates from the templates/snmp directory."""
    templates = []
    if not os.path.isdir(TEMPLATE_DIR):
        return templates
    for filename in sorted(os.listdir(TEMPLATE_DIR)):
        if filename.endswith((".yaml", ".yml")):
            path = os.path.join(TEMPLATE_DIR, filename)
            try:
                with open(path) as f:
                    data = yaml.safe_load(f)
                if data:
                    templates.append(data)
            except Exception:
                logger.exception("Failed to load template %s", filename)
    return templates


def match_template(
    sys_object_id: str, sys_descr: str, templates: list[dict]
) -> Optional[dict]:
    """Find matching template for a device by sysObjectID or sysDescr."""
    for tmpl in templates:
        pattern = tmpl.get("sys_object_id_pattern", "")
        if pattern and pattern in sys_object_id:
            return tmpl
        descr_pattern = tmpl.get("sys_descr_pattern", "")
        if descr_pattern and descr_pattern.lower() in sys_descr.lower():
            return tmpl
    return None


def template_to_json(tmpl: dict) -> str:
    """Convert template OID config to JSON string for DB storage."""
    return json.dumps(tmpl.get("oids", {}))


def find_matching_template(db, sys_descr: str, sys_object_id: str, device_type: str = None):
    """Query DeviceTemplate table and return best match for the given device identifiers."""
    from app.models.snmp import DeviceTemplate

    templates = db.execute(
        __import__("sqlalchemy").select(DeviceTemplate).where(DeviceTemplate.enabled == True)
    ).scalars().all()

    best = None
    best_score = 0

    for tmpl in templates:
        score = 0
        # sysObjectID pattern match (highest priority)
        if tmpl.sys_object_id_pattern and tmpl.sys_object_id_pattern in sys_object_id:
            score += 10
        # sysDescr pattern match
        if tmpl.sys_descr_pattern and tmpl.sys_descr_pattern.lower() in sys_descr.lower():
            score += 5
        # device_type match
        if device_type and tmpl.device_type == device_type:
            score += 2

        if score > best_score:
            best_score = score
            best = tmpl

    return best


def seed_templates_to_db(db_session) -> int:
    """Load YAML templates and upsert them into the device_templates table.
    Returns the number of templates upserted."""
    from sqlalchemy import select
    from app.models.snmp import DeviceTemplate

    templates = load_templates()
    upserted = 0

    for tmpl in templates:
        name = tmpl.get("name")
        if not name:
            continue

        existing = db_session.execute(
            select(DeviceTemplate).where(DeviceTemplate.name == name)
        ).scalar_one_or_none()

        oid_json = template_to_json(tmpl)
        alert_json = json.dumps(tmpl.get("alert_rules", {}))

        if existing:
            existing.device_type = tmpl.get("device_type", "other")
            existing.description = tmpl.get("description", "")
            existing.sys_object_id_pattern = tmpl.get("sys_object_id_pattern", "")
            existing.sys_descr_pattern = tmpl.get("sys_descr_pattern", "")
            existing.oid_config = oid_json
            existing.alert_rules = alert_json
        else:
            db_session.add(DeviceTemplate(
                name=name,
                device_type=tmpl.get("device_type", "other"),
                description=tmpl.get("description", ""),
                sys_object_id_pattern=tmpl.get("sys_object_id_pattern", ""),
                sys_descr_pattern=tmpl.get("sys_descr_pattern", ""),
                oid_config=oid_json,
                alert_rules=alert_json,
            ))
        upserted += 1

    db_session.commit()
    return upserted
