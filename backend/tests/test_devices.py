# SPDX-License-Identifier: GPL-3.0-or-later
import pytest
from app.models.site import Site


@pytest.mark.asyncio
async def test_create_device(auth_client, db):
    # Create a site first
    site = Site(name="Test Site", level=1)
    db.add(site)
    await db.commit()
    await db.refresh(site)

    resp = await auth_client.post("/api/devices/", json={
        "name": "Switch-01",
        "ip_address": "192.168.1.1",
        "device_type": "switch",
        "site_id": site.id,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Switch-01"
    assert data["ip_address"] == "192.168.1.1"
    assert data["status"] == "unknown"


@pytest.mark.asyncio
async def test_list_devices(auth_client, db):
    site = Site(name="Test Site 2", level=1)
    db.add(site)
    await db.commit()
    await db.refresh(site)

    await auth_client.post("/api/devices/", json={
        "name": "Device-A", "ip_address": "10.0.0.1", "site_id": site.id,
    })
    await auth_client.post("/api/devices/", json={
        "name": "Device-B", "ip_address": "10.0.0.2", "site_id": site.id,
    })

    resp = await auth_client.get("/api/devices/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


@pytest.mark.asyncio
async def test_get_device(auth_client, db):
    site = Site(name="Test Site 3", level=1)
    db.add(site)
    await db.commit()
    await db.refresh(site)

    create_resp = await auth_client.post("/api/devices/", json={
        "name": "Router-01", "ip_address": "172.16.0.1",
        "device_type": "router", "site_id": site.id,
    })
    device_id = create_resp.json()["id"]

    resp = await auth_client.get(f"/api/devices/{device_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Router-01"


@pytest.mark.asyncio
async def test_update_device(auth_client, db):
    site = Site(name="Test Site 4", level=1)
    db.add(site)
    await db.commit()
    await db.refresh(site)

    create_resp = await auth_client.post("/api/devices/", json={
        "name": "Old Name", "ip_address": "10.1.1.1", "site_id": site.id,
    })
    device_id = create_resp.json()["id"]

    resp = await auth_client.put(f"/api/devices/{device_id}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_device(auth_client, db):
    site = Site(name="Test Site 5", level=1)
    db.add(site)
    await db.commit()
    await db.refresh(site)

    create_resp = await auth_client.post("/api/devices/", json={
        "name": "Delete Me", "ip_address": "10.2.2.1", "site_id": site.id,
    })
    device_id = create_resp.json()["id"]

    resp = await auth_client.delete(f"/api/devices/{device_id}")
    assert resp.status_code == 200

    get_resp = await auth_client.get(f"/api/devices/{device_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_device_stats(auth_client):
    resp = await auth_client.get("/api/devices/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "online" in data
