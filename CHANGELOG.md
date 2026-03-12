# Changelog

## 2.0.0 (Unreleased)

### Added
- Complete backend rewrite with FastAPI + async
- JWT authentication with LDAP/Active Directory support
- Device CRUD with pagination and filtering
- Hierarchical site management (4-level depth)
- ICMP ping monitoring via fping with icmplib fallback
- SNMP v1/v2c/v3 polling with device templates
- HTTP/HTTPS endpoint monitoring with SSL cert expiry tracking
- Threshold-based alerting with email and webhook notifications
- Alert escalation policies
- Network discovery scanner
- Syslog UDP collector (RFC 3164/5424)
- SNMP trap receiver
- TimescaleDB hypertables for time-series data
- React + TypeScript SPA frontend with dark mode
- Nginx reverse proxy with SSL/TLS
- Docker Compose orchestration with health checks
- Debian package support
- GNU GPL v3 license
