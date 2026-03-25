# Changelog

## v0.9.0.7 (2026-03-25)

### Changed
- **Double-click to drill down** — site card grid and list view sub-site rows now require double-click to drill into child sites (prevents accidental navigation); map marker icons unchanged (single click for tooltip)

## v0.9.0.6 (2026-03-18)

### Added
- **Maintenance mode UI** — blue toggle button on device detail page next to Test Now; blue "Maint" badge in device list table and device detail status area
- **Maintenance count on dashboard** — new blue Maintenance card alongside Total/Online/Warning/Offline counts
- **Per-device alert metric exclusion** — toggle individual SNMP metrics (CPU, Memory, Disk, UPS Battery, etc.) on/off for alerting per device; shown as pill buttons in the SNMP Metrics panel
- **Email subject line editing** — customizable subject templates for down and recovery email notifications in Settings > Monitoring
- **Maintenance clears alerts** — entering maintenance mode automatically resolves all active/acknowledged alerts, resets status to online, and clears failure counters
- **Device sort order** — device list now sorts: offline > warning > maintenance > online, then alphabetical

### Fixed
- **Alert exclusion resolves existing alerts** — toggling a metric off immediately resolves active `server_metrics` alerts for that device and clears warning status
- **Maintenance devices can't be alerted** — guard in `notify_status_change` and `_update_device_status` prevents alert creation and status changes for devices in maintenance mode
- **SNMP poll respects exclusions** — `_check_server_metrics` skips excluded metrics and auto-resolves if no remaining threshold violations

### Security
- **LDAP injection fix** — escape special characters in LDAP filter username substitution
- **Path traversal fix** — validate file paths stay within UPLOAD_DIR/SSL_STORE_DIR before read/write/delete (sites, SSL certs, map images)
- **SSRF prevention** — HTTP check task blocks requests to localhost, loopback, link-local, and cloud metadata IPs
- **Email header injection fix** — sanitize Subject/From/To fields to strip newlines and control characters
- **Unsafe setattr hardening** — explicit field whitelists on user, device, and alert rule update endpoints
- **Nginx hardening** — `server_tokens off`, `X-Frame-Options DENY`, `Permissions-Policy` header, HSTS preload, remove `ws:` from CSP (wss only), block API doc routes
- **Docker non-root** — backend container now runs as `netmon` user (UID 1000)
- **Monitoring interval validation** — Pydantic Field bounds on all numeric settings (prevent DoS via zero intervals)
- **Login rate limiter moved to Redis** — works across multiple uvicorn workers, survives restarts

## v0.9.0.5 (2026-03-18)

### Added
- **Recovery email notifications** — configurable email alert when a device comes back online after consecutive successful pings (default: 3 pings required before recovery)
- **Recovery settings in UI** — Settings > Monitoring now has a "Recovery Settings" section with configurable "Pings Before Recovery" count and a toggle to enable/disable recovery emails
- **Email templates** — customizable email body templates for both down alerts and recovery notifications in Settings > Monitoring, with placeholders for `{device}`, `{ip}`, `{type}`, `{site}`, `{reason}`, `{severity}`, `{time}`, and `{recovery_pings}`
- **Device details in alert emails** — all alert and recovery emails now include device name, IP address, device type, and site name
- **Sites page auto-refresh** — Sites page now auto-refreshes every 30 seconds and on WebSocket updates, matching Dashboard and Devices page behavior
- **Ping task WebSocket broadcast** — ping task now publishes a `ping_update` message over WebSocket after each cycle so all pages update immediately
- **Bulk site creation script** — `scripts/bulk_scan.sh` for batch sub-site creation with network scanning and device import

### Fixed
- **Alert emails not sending** — fixed SMTP relay without authentication being treated as "not configured"; emails now send correctly on no-auth relays (port 25)
- **Celery worker stale SMTP config** — email notification function now reloads SMTP settings from `.env` on each send, so celery workers pick up config changes without restart
- **Duplicate SMTP bug in alerts task** — fixed the same no-auth SMTP issue in the `alerts.py` task's `_send_email` function
- **Recovery flapping** — devices no longer immediately flip to ONLINE on first successful ping; they must pass the configured number of consecutive successes (default 3) before being marked recovered

### Changed
- **Sites page layout** — site hierarchy and map panel now scroll independently; header banner reduced for more map space
- **`consecutive_successes` tracking** — new database column on devices table tracks successful pings during recovery to prevent premature ONLINE status

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
