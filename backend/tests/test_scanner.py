# SPDX-License-Identifier: GPL-3.0-or-later
"""
Tests for IP range parsing and scanner service.
"""
from app.services.scanner_service import parse_ip_range


def test_parse_cidr():
    ips = parse_ip_range("192.168.1.0/30")
    assert len(ips) == 2
    assert "192.168.1.1" in ips
    assert "192.168.1.2" in ips


def test_parse_dash_range():
    ips = parse_ip_range("10.0.0.1-5")
    assert len(ips) == 5
    assert "10.0.0.1" in ips
    assert "10.0.0.5" in ips


def test_parse_single_ip():
    ips = parse_ip_range("172.16.0.1")
    assert ips == ["172.16.0.1"]


def test_parse_large_subnet():
    ips = parse_ip_range("192.168.0.0/24")
    assert len(ips) == 254  # .1 through .254
