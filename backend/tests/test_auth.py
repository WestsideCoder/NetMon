# SPDX-License-Identifier: GPL-3.0-or-later
import pytest


@pytest.mark.asyncio
async def test_login_success(client, admin_user):
    resp = await client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "password123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["username"] == "testadmin"
    assert data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_login_bad_password(client, admin_user):
    resp = await client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client):
    resp = await client.post("/api/auth/login", json={
        "username": "nobody",
        "password": "password",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me(auth_client):
    resp = await auth_client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "testadmin"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client, admin_user):
    login_resp = await client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "password123",
    })
    refresh_token = login_resp.json()["refresh_token"]
    resp = await client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_change_password(auth_client):
    resp = await auth_client.post("/api/auth/change-password", json={
        "current_password": "password123",
        "new_password": "newpassword456",
    })
    assert resp.status_code == 200
