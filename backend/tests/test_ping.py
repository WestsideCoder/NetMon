# SPDX-License-Identifier: GPL-3.0-or-later
"""
Tests for fping output parsing and device status update logic.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

from app.models.device import Device, DeviceStatus
from app.tasks.ping import _run_fping, _update_device_status
from app.config import settings


def test_fping_parse_alive():
    """Test parsing fping output for alive host."""
    mock_result = MagicMock()
    mock_result.stderr = "192.168.1.1 : xmt/rcv/%loss = 3/3/0%, min/avg/max = 1.2/2.5/3.8\n"
    mock_result.returncode = 0

    with patch("subprocess.run", return_value=mock_result):
        results = _run_fping(["192.168.1.1"])
        assert "192.168.1.1" in results
        assert results["192.168.1.1"]["alive"] is True
        assert results["192.168.1.1"]["rtt"] == 2.5


def test_fping_parse_dead():
    """Test parsing fping output for dead host."""
    mock_result = MagicMock()
    mock_result.stderr = "192.168.1.2 : xmt/rcv/%loss = 3/0/100%\n"
    mock_result.returncode = 1

    with patch("subprocess.run", return_value=mock_result):
        results = _run_fping(["192.168.1.2"])
        assert "192.168.1.2" in results
        assert results["192.168.1.2"]["alive"] is False


def test_update_device_online():
    """Test device status update when ping succeeds."""
    device = Device(
        id=1, name="test", ip_address="1.1.1.1", site_id=1,
        status=DeviceStatus.UNKNOWN, total_checks=0,
        successful_checks=0, consecutive_failures=0,
    )
    db = MagicMock()
    db.add = MagicMock()

    _update_device_status(db, device, {"alive": True, "rtt": 5.0})

    assert device.status == DeviceStatus.ONLINE
    assert device.response_time == 5.0
    assert device.consecutive_failures == 0
    assert device.successful_checks == 1
    assert device.total_checks == 1


def test_update_device_warning():
    """Test device goes to warning after missed pings."""
    device = Device(
        id=1, name="test", ip_address="1.1.1.1", site_id=1,
        status=DeviceStatus.ONLINE, total_checks=10,
        successful_checks=9, consecutive_failures=settings.MISSED_PINGS_WARNING - 1,
    )
    db = MagicMock()
    db.add = MagicMock()

    _update_device_status(db, device, {"alive": False, "rtt": None})

    assert device.status == DeviceStatus.WARNING
    assert device.consecutive_failures == settings.MISSED_PINGS_WARNING


def test_update_device_offline():
    """Test device goes offline after critical threshold."""
    device = Device(
        id=1, name="test", ip_address="1.1.1.1", site_id=1,
        status=DeviceStatus.WARNING, total_checks=10,
        successful_checks=7, consecutive_failures=settings.MISSED_PINGS_CRITICAL - 1,
    )
    db = MagicMock()
    db.add = MagicMock()

    _update_device_status(db, device, {"alive": False, "rtt": None})

    assert device.status == DeviceStatus.OFFLINE
