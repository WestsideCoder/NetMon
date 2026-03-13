# Changelog

## 2026-03-13

### Added
- **Scan for Devices button** on Sites page — navigates to Discovery with the site pre-selected
- **List/Map view toggle** on Sites page — switch between floor plan map and device table view
- **Sub-sites in list view** — child sites displayed in a table with device stats (name, location, devices, online/offline counts)
- **Site status coloring** — sites with offline devices turn red everywhere: site tree, child grid cards, list view, dashboard widget, floor plan sidebar, and map markers; offline counts aggregate up the full hierarchy
- **View mode persistence** — list/map preference saved to localStorage across navigation and refreshes
- **SNMP Test button** on Settings page — test SNMP connectivity to a device IP directly from settings
- **Place All button** on floor plan — grid-arrange all unplaced devices and child sites onto the map
- **Auto SNMP poll on device create/import** — triggers an SNMP poll immediately when devices are created or imported via scanner, so names resolve right away
- **Post-import navigation** — after importing discovered devices, automatically navigates to the Sites page with the scanned site selected

### Fixed
- **User creation white screen** — fixed React error #31 caused by rendering 422 validation error objects as React children; error handler now extracts message strings from array responses
- **SNMP device names not pulling on discovery** — scanner import now triggers `snmp_poll_device.delay()` for each imported device with SNMP credentials

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
