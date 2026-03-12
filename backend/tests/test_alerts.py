# SPDX-License-Identifier: GPL-3.0-or-later
import pytest


@pytest.mark.asyncio
async def test_list_alerts(auth_client):
    resp = await auth_client.get("/api/alerts/")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_active_alerts(auth_client):
    resp = await auth_client.get("/api/alerts/active")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_alert_rule(auth_client):
    resp = await auth_client.post("/api/alerts/rules", json={
        "name": "High Response Time",
        "metric_name": "response_time",
        "condition": "gt",
        "threshold": 100.0,
        "severity": "warning",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "High Response Time"
    assert data["threshold"] == 100.0


@pytest.mark.asyncio
async def test_list_rules(auth_client):
    await auth_client.post("/api/alerts/rules", json={
        "name": "Test Rule",
        "metric_name": "uptime",
        "condition": "lt",
        "threshold": 99.0,
        "severity": "critical",
    })

    resp = await auth_client.get("/api/alerts/rules")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_delete_rule(auth_client):
    create_resp = await auth_client.post("/api/alerts/rules", json={
        "name": "Temp Rule",
        "metric_name": "temp",
        "condition": "gt",
        "threshold": 80.0,
        "severity": "info",
    })
    rule_id = create_resp.json()["id"]

    resp = await auth_client.delete(f"/api/alerts/rules/{rule_id}")
    assert resp.status_code == 200
