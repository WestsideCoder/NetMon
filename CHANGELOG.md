# Changelog

## v0.9.0.4 (2026-03-17)

### Added
- **Real-time alert notifications** — status change events (ping offline, SNMP failure, HTTP error, UPS battery) now immediately create alerts and dispatch email/webhook notifications via all enabled notification channels, with deduplication by metric name
- **Device name in alerts** — alert list now shows a dedicated Device column with the device name (loaded via joinedload), making it easier to identify affected devices at a glance
- **Warning status coloring** — sites with devices in WARNING state now show yellow highlighting across all views: site tree, child grid cards, list view, dashboard map widget, floor plan sidebar, and map markers (previously only offline/red was shown)
- **Map auto-fit zoom** — floor plan and root map viewers now automatically calculate and apply the optimal zoom level to fit the entire image in the viewport on load; "Fit to frame" button uses the same calculation
- **Site navigation persistence** — selected site ID, drill-down navigation stack, and tree expansion state are now saved to sessionStorage, preserving your place across page refreshes and back-button navigation
- **Auto-select single root site** — when only one root site exists, it is automatically selected on page load so users land directly on the site panel with edit controls
- **UPS false on-battery cross-check** — SNMP polling now cross-checks input voltage when a UPS reports on-battery status; if input voltage is above 90V (mains present), the false on-battery state is ignored (common APC NMC firmware issue)

### Fixed
- **Stale alert auto-resolution** — alerts for metrics that are no longer collected are now automatically resolved instead of staying active indefinitely
- **Ping alert recovery** — both active and acknowledged ping alerts are now resolved when a device comes back online (previously only acknowledged alerts were cleared)
- **UPS stuck WARNING** — UPS devices that had no remaining active alerts but were still in WARNING status are now properly reset to ONLINE

### Changed
- **Docker Compose restart policy** — added `restart: unless-stopped` to all services (db, redis, backend, celery-worker, celery-beat, nginx) for automatic recovery after host reboots
- **Alert notification consolidation** — unified notification dispatch logic into `alert_service.py` (`notify_status_change` + `_dispatch_notification`), replacing the separate `_send_notification` in the alerts task

## v0.9.0.2 (2026-03-13)

### Added
- **Check for Updates** — automatic version check against GitHub releases on page load (cached 24h), with manual "Check for Updates" button in Settings > About; update indicator in sidebar when new version available
- **About section** in Settings — shows current version, latest version, release link, GitHub repo, and license info
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
