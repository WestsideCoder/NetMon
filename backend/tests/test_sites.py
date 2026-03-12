# SPDX-License-Identifier: GPL-3.0-or-later
import pytest


@pytest.mark.asyncio
async def test_create_site(auth_client):
    resp = await auth_client.post("/api/sites/", json={
        "name": "HQ",
        "location": "New York",
        "description": "Headquarters",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "HQ"
    assert data["level"] == 1


@pytest.mark.asyncio
async def test_create_child_site(auth_client):
    parent_resp = await auth_client.post("/api/sites/", json={"name": "District A"})
    parent_id = parent_resp.json()["id"]

    child_resp = await auth_client.post("/api/sites/", json={
        "name": "Building 1",
        "parent_site_id": parent_id,
    })
    assert child_resp.status_code == 201
    assert child_resp.json()["level"] == 2
    assert child_resp.json()["parent_site_id"] == parent_id


@pytest.mark.asyncio
async def test_list_sites(auth_client):
    await auth_client.post("/api/sites/", json={"name": "Site X"})
    await auth_client.post("/api/sites/", json={"name": "Site Y"})

    resp = await auth_client.get("/api/sites/")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.asyncio
async def test_site_tree(auth_client):
    resp = await auth_client.get("/api/sites/tree")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_delete_site_with_devices_fails(auth_client, db):
    from app.models.site import Site
    from app.models.device import Device

    site = Site(name="Busy Site", level=1)
    db.add(site)
    await db.commit()
    await db.refresh(site)

    device = Device(name="Dev1", ip_address="10.99.99.1", site_id=site.id)
    db.add(device)
    await db.commit()

    resp = await auth_client.delete(f"/api/sites/{site.id}")
    assert resp.status_code == 400
