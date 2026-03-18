# SPDX-License-Identifier: GPL-3.0-or-later
"""
Application configuration using Pydantic Settings.
Loads from environment variables with validation.
"""
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import EmailStr


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Application
    APP_NAME: str = "NetMon (Beta)"
    VERSION: str = "0.9.0.5"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = "postgresql://netmon:netmon_dev_password@db:5432/netmon"
    TIMESCALEDB_ENABLED: bool = True

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost",
        "https://localhost",
    ]

    # LDAP
    LDAP_ENABLED: bool = False
    LDAP_SERVER: str = "ldap://ldap.example.com"
    LDAP_PORT: int = 389
    LDAP_USE_SSL: bool = False
    LDAP_BASE_DN: str = "dc=example,dc=com"
    LDAP_BIND_DN: Optional[str] = None
    LDAP_BIND_PASSWORD: Optional[str] = None
    LDAP_USER_FILTER: str = "(sAMAccountName={username})"
    LDAP_GROUP_ATTR: str = "memberOf"
    LDAP_ADMIN_GROUP: str = "CN=NetMon Admins,OU=Groups,DC=example,DC=com"
    LDAP_OPERATOR_GROUP: str = "CN=NetMon Operators,OU=Groups,DC=example,DC=com"

    # Email/SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: EmailStr = "monitoring@example.com"
    SMTP_USE_TLS: bool = True

    # Monitoring
    PING_INTERVAL: int = 60  # seconds
    SNMP_POLL_INTERVAL: int = 300  # seconds (5 minutes)
    HTTP_CHECK_INTERVAL: int = 120  # seconds
    NTP_POLL_INTERVAL: int = 60  # seconds
    MISSED_PINGS_WARNING: int = 2
    MISSED_PINGS_CRITICAL: int = 3

    # Metric thresholds (percent) — exceed = WARNING, critical = OFFLINE
    CPU_WARNING_PERCENT: int = 90
    CPU_CRITICAL_PERCENT: int = 95
    MEMORY_WARNING_PERCENT: int = 90
    MEMORY_CRITICAL_PERCENT: int = 95
    DISK_WARNING_PERCENT: int = 90
    DISK_CRITICAL_PERCENT: int = 95

    # Recovery
    RECOVERY_PINGS: int = 3  # consecutive successes before marking device online
    RECOVERY_EMAIL_ENABLED: bool = True  # send email when device recovers

    # Email templates (placeholders: {device}, {ip}, {type}, {site}, {reason}, {time})
    EMAIL_TEMPLATE_DOWN: str = (
        "ALERT: {device} is {severity}\n\n"
        "Device: {device}\n"
        "IP Address: {ip}\n"
        "Type: {type}\n"
        "Site: {site}\n"
        "Reason: {reason}\n"
        "Time: {time}"
    )
    EMAIL_TEMPLATE_UP: str = (
        "RECOVERED: {device} is back online\n\n"
        "Device: {device}\n"
        "IP Address: {ip}\n"
        "Type: {type}\n"
        "Site: {site}\n"
        "Recovered after {recovery_pings} consecutive successful pings.\n"
        "Time: {time}"
    )

    # DNS servers for reverse lookups (comma-separated)
    DNS_SERVERS: str = ""

    # DHCP sync (Windows DHCP Server via PowerShell remoting)
    DHCP_ENABLED: bool = False
    DHCP_SERVERS: str = ""  # comma-separated list of DHCP server IPs/hostnames
    DHCP_USERNAME: str = ""
    DHCP_PASSWORD: str = ""
    DHCP_USE_SSL: bool = True
    DHCP_AUTH: str = "negotiate"  # negotiate, ntlm, kerberos, credssp
    DHCP_SYNC_INTERVAL: int = 3600  # seconds (default 1 hour)

    # Syslog / SNMP Trap
    SYSLOG_PORT: int = 514
    SNMP_TRAP_PORT: int = 162

    # File uploads
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
