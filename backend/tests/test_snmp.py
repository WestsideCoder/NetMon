# SPDX-License-Identifier: GPL-3.0-or-later
import pytest


@pytest.mark.asyncio
async def test_create_credential(auth_client):
    resp = await auth_client.post("/api/snmp/credentials", json={
        "name": "Public v2c",
        "version": "v2c",
        "community": "public",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Public v2c"
    assert data["version"] == "v2c"
    # Community should be masked
    assert "****" in data["community"]


@pytest.mark.asyncio
async def test_list_credentials(auth_client):
    await auth_client.post("/api/snmp/credentials", json={
        "name": "Cred A", "version": "v2c", "community": "test",
    })

    resp = await auth_client.get("/api/snmp/credentials")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_update_credential(auth_client):
    create_resp = await auth_client.post("/api/snmp/credentials", json={
        "name": "Update Me", "version": "v2c", "community": "old",
    })
    cred_id = create_resp.json()["id"]

    resp = await auth_client.put(f"/api/snmp/credentials/{cred_id}", json={
        "community": "newcommunity",
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_credential(auth_client):
    create_resp = await auth_client.post("/api/snmp/credentials", json={
        "name": "Delete Me", "version": "v1", "community": "deletethis",
    })
    cred_id = create_resp.json()["id"]

    resp = await auth_client.delete(f"/api/snmp/credentials/{cred_id}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_templates(auth_client):
    resp = await auth_client.get("/api/snmp/templates")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
