# NetMon (Beta) v0.9 — User Manual

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Dashboard](#3-dashboard)
4. [Devices](#4-devices)
5. [Sites & Maps](#5-sites--maps)
6. [Alerts](#6-alerts)
7. [Network Discovery](#7-network-discovery)
8. [Settings](#8-settings)
9. [SSL Certificate Management](#9-ssl-certificate-management)
10. [User Roles & Permissions](#10-user-roles--permissions)
11. [Deployment & Configuration](#11-deployment--configuration)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Introduction

NetMon is a network monitoring system designed to track the health and performance of network infrastructure including servers, switches, routers, UPS devices, cameras, and access points.

**Key capabilities:**

- ICMP ping monitoring with configurable intervals
- SNMP v1/v2c/v3 metric collection (CPU, memory, disk, UPS battery, etc.)
- HTTP/HTTPS endpoint monitoring with SSL certificate expiry tracking
- NTP time synchronization monitoring
- Interactive site maps with floor plan overlays and device positioning
- Real-time alerts with email, Slack, and webhook notifications
- Network discovery scanner with SNMP auto-detection
- SSL/TLS certificate management for the monitoring interface
- Role-based access control (Admin, Operator, Viewer)
- Dark mode interface

---

## 2. Getting Started

### 2.1 First Login

On first startup, NetMon creates a default admin account with:

- **Username:** `admin`
- **Password:** `admin1234`

Log in with these credentials. You will be prompted to change your password immediately.

### 2.2 Navigation

The sidebar on the left provides access to all sections:

| Icon | Page | Description |
|------|------|-------------|
| Home | Dashboard | Monitoring overview and widgets |
| Monitor | Devices | Device list and management |
| Map | Sites | Site hierarchy and floor plans |
| Bell | Alerts | Alert list and management |
| Radar | Discovery | Network scanner |
| Gear | Settings | System configuration |

The sidebar can be collapsed by clicking the toggle at the bottom. In collapsed mode, hovering over icons shows tooltips.

### 2.3 Header Controls

The top-right header contains:

- **Dark Mode Toggle** — Sun/Moon icon to switch between light and dark themes (persists across sessions)
- **User Menu** — Click your username to access:
  - User Settings (edit name, email)
  - Change Password (local accounts only)
  - Logout

---

## 3. Dashboard

The dashboard provides an at-a-glance view of your monitored infrastructure.

### 3.1 Status Cards

Four summary cards at the top show:

- **Total** — Total number of monitored devices
- **Online** — Devices responding normally
- **Warning** — Devices with degraded performance or missed pings
- **Offline** — Devices that have stopped responding

Click any card to jump to the Devices page filtered by that status.

### 3.2 Dashboard Widgets

The dashboard uses a configurable widget system. Click the **gear icon** in the top-right corner to:

- Toggle widgets on/off
- Drag widgets to reorder them
- Reset to default layout

**Available widgets:**

| Widget | Description |
|--------|-------------|
| Status Cards | Device health summary counts |
| SNMP Highlights | Key SNMP metrics from monitored devices (battery %, CPU, memory) |
| Site Maps | Thumbnail previews of up to 4 sites with floor plans |
| Active Alerts | List of current unresolved alerts |
| System Overview | Device type breakdown chart |
| Offline Devices | List of devices currently down |
| Recent Devices | Most recently added devices |

### 3.3 Real-Time Updates

The dashboard auto-refreshes every 30 seconds and receives push updates via WebSocket when device states change.

---

## 4. Devices

### 4.1 Device List

The Devices page shows all monitored devices in a table with the following columns:

- **Name** — Click to open device detail page
- **IP Address**
- **Type** — UPS, Switch, Router, Server, Camera, Access Point, IoT, Other
- **Site** — The site this device belongs to
- **Status** — Color-coded badge (green/yellow/red/gray) with reason text if degraded
- **Response Time** — Last ping round-trip time in milliseconds
- **Last Seen** — Relative time since last successful check
- **Uptime** — Historical uptime percentage
- **Actions** — Edit and Delete buttons

#### Searching and Filtering

Use the controls above the table to narrow results:

- **Search** — Type to filter by device name
- **Status** — Filter by Online, Warning, Offline, or Unknown
- **Type** — Filter by device type
- **Site** — Filter by site
- **Clear Filters** — Reset all filters

#### Bulk Operations

Select multiple devices using the checkboxes, then use the bulk edit panel to:

- Move devices to a different site
- Change device type
- Enable/disable SNMP (with credential and template selection)
- Enable/disable maintenance mode

### 4.2 Adding a Device

Click **Add Device** to open the creation form.

**Basic fields:**

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Display name for the device |
| IP Address | Yes | IPv4 address to monitor |
| Device Type | Yes | Select from dropdown |
| Site | Yes | Assign to a site |
| VLAN | No | VLAN tag number |
| HTTP URL | No | URL to monitor (enables HTTP checks) |
| Notes | No | Free-text notes |

**SNMP section** (toggle to enable):

| Field | Description |
|-------|-------------|
| SNMP Credential | Select from configured credentials |
| SNMP Template | Select a template or "Auto-detect" |
| Probe SNMP | Button that queries the device and auto-fills name, type, OS, and template |

**Additional checks:**

- **NTP Check** — Enable NTP time sync monitoring
- **Web Check** — Enable HTTP/HTTPS port probing

### 4.3 Editing a Device

Click the **Edit** button in the device table or on the device detail page. The same form opens pre-filled with the current device configuration.

### 4.4 Device Detail Page

Click a device name to open its detail page, which contains:

#### Header Section
- Device name, IP, and site
- Current status badge with reason
- **Test Now** button — Runs an immediate check and displays results for:
  - Ping (alive/dead, response time)
  - SNMP (success/failed, data retrieved)
  - HTTP (status code, response time, SSL cert expiry)
  - NTP (stratum, offset, RTT, server time)
  - Web Probe (HTTP/HTTPS port status)
- **Edit** button

#### Stats Grid
Quick-look metrics: type, response time, uptime percentage, last seen, total checks, consecutive failures, SNMP status, maintenance mode.

#### NTP Section (if enabled)
- **Stratum** — Colored by level (green=1, yellow=2-15, red=16)
- **Clock Offset** — Deviation from reference in milliseconds
- **RTT** — Round-trip time to NTP server
- **Device Time** — Current device clock (UTC)

#### SNMP Metrics Panel
Displays device-type-specific data:

- **UPS** — Battery capacity gauge, charge remaining, battery status (online/on battery/low battery), load, voltage, temperature, runtime
- **Server** — CPU, memory, and disk utilization with progress bars and historical charts
- **Switch/Router** — Port status table, uplink information
- **Generic** — All available OIDs displayed as key-value pairs

SNMP charts show historical data (configurable from 1 to 168 hours).

#### Device Location Mini-Map
If the device's site has a floor plan, a mini-map shows the device's position highlighted with a blue ring. Other devices on the same site are shown faded. Click a sibling device to navigate to its detail page.

### 4.5 Maintenance Mode

Maintenance mode temporarily suspends monitoring for a device. To enable it:

- Click **Maintenance** on the device detail page, or
- Use bulk edit to toggle maintenance for multiple devices

Devices in maintenance mode will not trigger alerts or status changes. An optional end-time can be set for automatic re-enablement.

---

## 5. Sites & Maps

Sites represent your physical infrastructure hierarchy. NetMon supports up to 4 levels of nesting:

```
District
  └── Site
       └── Building
            └── Floor
```

### 5.1 Site Tree

The left panel shows all sites in a collapsible tree structure. Click a site to view its details in the right panel. Sites with uploaded floor plans show a green image icon.

### 5.2 Creating a Site

Click **Add Child Site** within a parent site's panel, or create a top-level site from the tree header. Fields:

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Site display name |
| Parent Site | No | Parent in hierarchy (empty = top-level) |
| Location | No | Physical address or description |
| Contact Name | No | Site contact person |
| Contact Email | No | Contact email address |
| Description | No | Additional notes |

### 5.3 Floor Plan Maps

Upload floor plan images to visualize device locations within a site.

#### Uploading a Map Image

Click **Upload Map Image** on any site. Two options:

1. **Upload New** — Drag-and-drop or click to select an image file (PNG, JPG, GIF, or WebP, max 10 MB)
2. **From Library** — Select a previously uploaded image to reuse across multiple sites

#### Positioning Devices on the Map

1. Click **Edit Positions** to enter edit mode
2. Drag existing device markers to reposition them
3. Drag devices from the **Unpositioned** list onto the map
4. Click **Save Positions** to persist changes, or **Cancel** to discard

Device markers are color-coded by status:
- Green = Online
- Yellow = Warning
- Red = Offline
- Gray = Unknown

Click a marker to see a tooltip with the device name, IP, and status. Click the tooltip link to navigate to the device detail page.

#### Child Site Markers

Non-floor-level sites can show child sites on the map. Child site markers are also draggable in edit mode. Click a child site marker to drill down into it.

### 5.4 Navigating the Map

- **Breadcrumb** — Shows the current drill-down path; click any ancestor to navigate back up
- **Zoom Controls** — Use the +/- buttons to zoom in and out (zoom level is saved per site)
- **Full Screen** — Toggle full-screen map view

### 5.5 Child Sites Grid

For non-floor-level sites, a grid of cards shows each child site with:
- Thumbnail preview (or placeholder)
- Site name
- Device count
- Status bar showing online/warning/offline device breakdown

Click a card to drill down.

### 5.6 Map Image Library

Uploaded map images are stored in a shared library. Admins can manage the library from the Map Image Upload modal's "From Library" tab. Images that are in use by sites cannot be deleted.

---

## 6. Alerts

### 6.1 Alert List

The Alerts page shows all monitoring alerts with filter buttons:

- **All** — Show all alerts
- **Active** — New, unacknowledged alerts
- **Acknowledged** — Alerts that have been seen by an operator
- **Resolved** — Cleared alerts

Each alert shows:
- **Severity** — Color-coded badge (info, warning, critical)
- **Title** — Alert description (click to view the affected device)
- **Status** — Active, Acknowledged, or Resolved
- **Triggered** — When the alert was created (relative time)

### 6.2 Managing Alerts

- **Acknowledge** — Click **Ack** to indicate you've seen the alert. This stops escalation notifications.
- **Resolve** — Click **Resolve** to mark the alert as cleared.

Some alerts auto-resolve when the condition clears (e.g., UPS returns to normal power, battery status normalizes).

### 6.3 Alert Rules

Alert rules are configured in Settings (admin only). Each rule defines:

- A metric to monitor (e.g., `upsBasicBatteryStatus`, `cpu_percent`)
- A condition (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`)
- A threshold value
- A severity level (info, warning, critical)

### 6.4 Notifications

When a new alert is triggered, NetMon sends notifications to all enabled notification channels. Supported channel types:

- **Email** — Sends alert details via SMTP
- **Webhook** — HTTP POST with JSON payload to a URL
- **Slack** — Slack-compatible webhook format

Notification channels are configured in Settings > Notifications.

### 6.5 Escalation

Escalation policies can re-notify a channel if an alert remains unacknowledged past a configurable delay (in minutes). This ensures critical alerts are not missed.

---

## 7. Network Discovery

The Discovery page lets you scan IP ranges to find devices on your network.

### 7.1 Running a Scan

1. Enter an **IP Range** in CIDR notation (e.g., `192.168.1.0/24`) or as a range (e.g., `192.168.1.1-254`)
2. Select a **Site** to assign discovered devices to
3. Optionally enable **SNMP Testing** to probe discovered hosts:
   - Select specific credentials to test, or leave all unchecked to test with all active credentials
4. Click **Start Scan**

### 7.2 Scan Progress

A progress bar shows:
- Current phase (Pinging IPs... / Testing SNMP...)
- Completion percentage
- Alive host count
- SNMP-responding device count

### 7.3 Scan Results

After completion, a results table shows:

| Column | Description |
|--------|-------------|
| IP Address | Discovered host IP |
| Hostname | Reverse DNS lookup result |
| Ping Status | Alive/dead with response time |
| SNMP Info | Device type, system name, system description |
| Detected Type | Auto-classified device type |

### 7.4 Importing Devices

1. Select devices using the checkboxes (or **Select All**)
2. Click **Import** to add them to your inventory

Imported devices will be assigned to the site you selected before scanning and will begin monitoring automatically.

---

## 8. Settings

Access Settings from the sidebar (gear icon). The settings page has a sidebar with six sections.

### 8.1 Monitoring

Configure monitoring intervals and alert thresholds.

**Timing:**

| Setting | Default | Description |
|---------|---------|-------------|
| Ping Interval | 60s | How often devices are pinged |
| Missed Pings for Warning | 2 | Consecutive failures before WARNING status |
| Missed Pings for Critical | 3 | Consecutive failures before OFFLINE status |
| SNMP Poll Interval | 300s | How often SNMP metrics are collected |
| HTTP Check Interval | 120s | How often HTTP endpoints are checked |

**Server Metric Thresholds:**

| Metric | Warning Default | Critical Default |
|--------|----------------|------------------|
| CPU | 90% | 95% |
| Memory | 90% | 95% |
| Disk | 90% | 95% |

A summary line shows calculated timing, e.g., "Warning after 120s (2 missed pings), Critical after 180s (3 missed pings)."

Click **Save Settings** to apply changes (admin only).

### 8.2 SNMP Credentials

Manage SNMP credentials used to communicate with devices.

Click **Add Credential** to create a new credential:

**For SNMP v1/v2c:**

| Field | Description |
|-------|-------------|
| Name | Descriptive name |
| Version | v1 or v2c |
| Port | Default 161 |
| Community String | The SNMP community (stored encrypted) |

**For SNMP v3:**

| Field | Description |
|-------|-------------|
| Name | Descriptive name |
| Port | Default 161 |
| Username | SNMPv3 security name |
| Auth Protocol | None, MD5, SHA, SHA-256, or SHA-512 |
| Auth Password | Authentication password (stored encrypted) |
| Privacy Protocol | None, DES, AES-128, AES-192, or AES-256 |
| Privacy Password | Encryption password (stored encrypted) |

All sensitive fields (community strings, passwords) are encrypted at rest using Fernet (AES-128-CBC + HMAC) and displayed masked in the UI.

### 8.3 Notifications

Create and manage notification channels.

Click **Add Channel** and select the type:

- **Email** — Enter a recipient email address. Use the "Quick Fill from User" dropdown to auto-populate from existing users.
- **Webhook** — Enter a URL that will receive HTTP POST requests with alert data.
- **Slack** — Enter a Slack incoming webhook URL.

Each channel can be individually enabled or disabled.

### 8.4 Email Server

Configure SMTP settings for email notifications and test emails.

| Field | Description |
|-------|-------------|
| SMTP Host | Mail server hostname |
| SMTP Port | Mail server port (default 587) |
| Username | SMTP authentication username |
| Password | SMTP authentication password (displayed as **** if set) |
| From Address | Sender email address |
| Use TLS | Enable STARTTLS encryption |

After saving, use the **Send Test** section to verify the configuration by sending a test email to any address.

### 8.5 Users

Manage user accounts (admin only).

The user table shows all accounts with:
- Username, email, role, authentication source (local/LDAP), active status

Click **Add User** to create an account:

| Field | Required | Description |
|-------|----------|-------------|
| Username | Yes | Login username (3-50 characters) |
| Email | Yes | Valid email address |
| Password | Yes (new) | Minimum 8 characters |
| Full Name | No | Display name |
| Role | Yes | Admin, Operator, or Viewer |

When editing a user, leave the password field blank to keep the current password. Admins can activate/deactivate accounts.

### 8.6 SSL / TLS

See [Section 9: SSL Certificate Management](#9-ssl-certificate-management).

---

## 9. SSL Certificate Management

NetMon includes a built-in SSL certificate manager for the web interface.

### 9.1 Status Banner

The top of the SSL settings section shows the current certificate status:

- **Green** — Active certificate, not expiring soon
- **Yellow** — Active certificate expiring within 30 days
- **Red** — Active certificate has expired
- **Gray** — No active certificate (using default self-signed)

### 9.2 Certificate Authority (CA)

To issue your own certificates, first generate a CA:

1. Click **Generate CA**
2. Fill in the form:
   - **Name** — Descriptive name for this CA
   - **Common Name** — e.g., `netmon.local`
   - **Organization** — Default: NetMon
   - **Validity** — Days until expiry (default: 3650 / ~10 years)
   - **Key Size** — 2048 or 4096 bits
3. Click **Generate**

After generating, click **Download CA** to distribute the CA certificate to client machines for trust.

### 9.3 Server Certificates

Generate a server certificate signed by your CA:

1. Click **Generate Server Certificate**
2. Fill in the form:
   - **Name** — Descriptive name
   - **Common Name** — The hostname users will access (e.g., `netmon.example.com`)
   - **SANs (DNS)** — Additional DNS names, one per line
   - **SANs (IPs)** — Additional IP addresses, one per line
   - **Validity** — Days until expiry (default: 365)
   - **Key Size** — 2048 or 4096 bits
3. Click **Generate**

### 9.4 Uploading External Certificates

To use a certificate from an external CA:

1. Click **Upload Certificate**
2. Upload or paste the certificate file (PEM format)
3. Upload or paste the private key file (PEM format)

### 9.5 Activating a Certificate

1. Find the certificate in the list
2. Click **Activate**
3. Click **Reload Nginx** to apply the change

The nginx reverse proxy will pick up the new certificate immediately after reload.

### 9.6 Downloading Certificates

- Click **Download** next to any certificate to download the PEM file
- Click **Download CA** to get the CA certificate for client trust distribution

---

## 10. User Roles & Permissions

NetMon uses three roles with hierarchical permissions:

### Role Hierarchy

| Action | Viewer | Operator | Admin |
|--------|--------|----------|-------|
| View dashboard, devices, sites, alerts | Yes | Yes | Yes |
| View settings and SNMP credentials | Yes | Yes | Yes |
| Create/edit devices | | Yes | Yes |
| Create/edit sites | | Yes | Yes |
| Upload map images | | Yes | Yes |
| Run network scans | | Yes | Yes |
| Test devices (on-demand check) | | Yes | Yes |
| Acknowledge/resolve alerts | | Yes | Yes |
| Create/edit SNMP credentials | | Yes | Yes |
| Toggle maintenance mode | | Yes | Yes |
| Delete devices and sites | | | Yes |
| Manage users | | | Yes |
| Manage notification channels | | | Yes |
| Configure monitoring settings | | | Yes |
| Manage SSL certificates | | | Yes |
| Create/edit alert rules | | | Yes |
| Configure email server | | | Yes |

### Authentication Sources

- **Local** — Username/password stored in NetMon (bcrypt hashed)
- **LDAP** — Active Directory or LDAP server authentication with group-based role mapping

---

## 11. Deployment & Configuration

### 11.1 System Requirements

- Docker and Docker Compose
- Minimum 4 GB RAM (8 GB recommended)
- 20 GB disk space for database and uploads

### 11.2 Quick Start (Development)

```bash
# Clone or extract the project
cd netmon/export

# Copy and edit environment variables
cp .env.example .env
# Edit .env with your settings

# Start all services
docker compose up -d

# Default login: admin / admin1234 (you'll be prompted to change it)
```

### 11.3 Production Deployment

```bash
# Use the production override file
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Critical production settings in `.env`:**

```bash
# REQUIRED: Change from default
SECRET_KEY=<generate-a-long-random-string>
ENVIRONMENT=production

# Database
POSTGRES_PASSWORD=<strong-password>

# SMTP (for email notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=monitoring@example.com
SMTP_PASSWORD=<app-password>
SMTP_FROM=monitoring@example.com
```

**Building the frontend for production:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm -e VITE_API_URL= -e VITE_WS_URL= \
  frontend sh -c "npm run build"
```

The empty `VITE_API_URL=` and `VITE_WS_URL=` values are intentional — they ensure the frontend uses relative URLs, which is required for the nginx reverse proxy to work correctly.

### 11.4 Services Overview

| Service | Purpose | Default Port |
|---------|---------|-------------|
| nginx | Reverse proxy, SSL termination, serves frontend | 80, 443 |
| backend | FastAPI application server | 8000 (dev only) |
| celery-worker | Background task processor (ping, SNMP, HTTP checks) | — |
| celery-beat | Periodic task scheduler | — |
| db | PostgreSQL 15 with TimescaleDB | 5432 (dev only) |
| redis | Task queue, WebSocket pub/sub, token blocklist | 6379 (dev only) |
| docker-proxy | Restricted Docker API proxy (nginx reload only) | — |
| ssl-init | Seeds default SSL certificates on first start | — |

In production, only ports 80 and 443 (nginx) are exposed. All other services are internal.

### 11.5 Environment Variables Reference

**Application:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (dev default) | JWT signing key — **must change in production** |
| `ENVIRONMENT` | development | Set to `production` for production mode |
| `DEBUG` | false | Enable debug logging |

**Database:**

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | postgresql://netmon:...@db:5432/netmon | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | netmon_dev_password | Database password |
| `TIMESCALEDB_ENABLED` | true | Enable time-series compression |

**Redis:**

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | redis://redis:6379/0 | Redis connection string |

**Monitoring:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PING_INTERVAL` | 60 | Ping check interval (seconds) |
| `SNMP_POLL_INTERVAL` | 300 | SNMP poll interval (seconds) |
| `HTTP_CHECK_INTERVAL` | 120 | HTTP check interval (seconds) |
| `MISSED_PINGS_WARNING` | 2 | Misses before WARNING |
| `MISSED_PINGS_CRITICAL` | 3 | Misses before OFFLINE |

**LDAP (optional):**

| Variable | Default | Description |
|----------|---------|-------------|
| `LDAP_ENABLED` | false | Enable LDAP authentication |
| `LDAP_SERVER` | — | LDAP server hostname |
| `LDAP_PORT` | 389 | LDAP port |
| `LDAP_USE_SSL` | false | Use LDAPS |
| `LDAP_BASE_DN` | — | Search base DN |
| `LDAP_BIND_DN` | — | Bind account DN |
| `LDAP_BIND_PASSWORD` | — | Bind account password |
| `LDAP_ADMIN_GROUP` | — | AD group for admin role mapping |
| `LDAP_OPERATOR_GROUP` | — | AD group for operator role mapping |

### 11.6 Data Retention

NetMon uses TimescaleDB for time-series data with automatic management:

- **Raw metric data** — Retained for 90 days, then automatically dropped
- **SNMP data compression** — Data older than 7 days is compressed to save disk space
- **Status history** — Retained for 90 days

### 11.7 Backup

Back up the PostgreSQL database:

```bash
docker compose exec db pg_dump -U netmon netmon > backup.sql
```

Restore:

```bash
docker compose exec -T db psql -U netmon netmon < backup.sql
```

Also back up the named volumes for uploads and SSL certificates:

```bash
docker run --rm -v netmon_backend_uploads:/data -v $(pwd):/backup \
  alpine tar czf /backup/uploads.tar.gz -C /data .

docker run --rm -v netmon_ssl_store:/data -v $(pwd):/backup \
  alpine tar czf /backup/ssl_store.tar.gz -C /data .
```

---

## 12. Troubleshooting

### Backend won't start

**Check logs:**
```bash
docker compose logs backend --tail 50
```

**Common causes:**
- `FATAL: SECRET_KEY is set to the default value` — Set a unique `SECRET_KEY` in `.env` for production
- Database connection refused — Ensure the `db` service is running and healthy: `docker compose ps`
- Port conflict — Another service may be using port 8000 or 443

### Devices show as Offline but are reachable

- **Check ping permissions** — The backend container needs `NET_RAW` capability for ICMP. This is configured in `docker-compose.yml` by default.
- **Check maintenance mode** — Devices in maintenance mode do not update status.
- **Check monitoring intervals** — A device may not have been checked yet. Default ping interval is 60 seconds.

### SNMP not collecting data

1. Verify the SNMP credential is correct — Go to Settings > SNMP and check the credential is active
2. Test the credential — Use the **Test** button to verify connectivity
3. Check the device has SNMP enabled — Use the **Probe SNMP** button in the device form
4. Verify the template — Auto-detect should match most devices; manually assign if needed

### Alerts not sending notifications

1. Check notification channels are enabled in Settings > Notifications
2. Verify email server settings in Settings > Email Server
3. Use **Send Test** to verify SMTP connectivity
4. Check backend logs for delivery errors

### WebSocket disconnections

Real-time updates require a WebSocket connection. If the connection drops:

- The frontend automatically reconnects after 5 seconds
- Ensure nginx is configured to proxy WebSocket connections (default config handles this)
- Check that the JWT token hasn't expired

### SSL certificate issues

- **Browser shows "not secure"** — Install the CA certificate on client machines, or use a certificate from a trusted CA
- **Certificate expired** — Generate a new server certificate and activate it
- **Changes not taking effect** — Click **Reload Nginx** after activating a certificate

### Database performance

If the application becomes slow:

```bash
# Check database size
docker compose exec db psql -U netmon -c "SELECT pg_size_pretty(pg_database_size('netmon'));"

# Check TimescaleDB chunk sizes
docker compose exec db psql -U netmon -c "SELECT * FROM timescaledb_information.hypertables;"

# Manual vacuum
docker compose exec db psql -U netmon -c "VACUUM ANALYZE;"
```

### Resetting admin password

If you've lost access to the admin account:

```bash
docker compose exec backend python -c "
from app.core.security import get_password_hash
print(get_password_hash('NewPassword123'))
"
# Copy the hash, then:
docker compose exec db psql -U netmon -c \
  "UPDATE users SET hashed_password='<paste-hash>', must_change_password=true WHERE username='admin';"
```

---

## Appendix A: SNMP Templates

NetMon ships with pre-configured SNMP templates for common device types:

| Template | Device Type | Auto-Detect Pattern | Key Metrics |
|----------|------------|---------------------|-------------|
| APC UPS | UPS | sysObjectID: 1.3.6.1.4.1.318 | Battery %, runtime, voltage, load, temp |
| Generic UPS | UPS | sysDescr: "UPS" | Battery %, charge remaining, status |
| Linux Server | Server | sysDescr: "Linux" | CPU load, memory %, disk % |
| Windows Server | Server | sysDescr: "Windows" | CPU load, memory %, disk % |
| Cisco IOS | Switch/Router | sysObjectID: 1.3.6.1.4.1.9 | CPU busy %, memory used |
| Generic Switch | Switch | sysDescr: "switch" | sysUpTime, sysName |
| Generic SNMP | Generic | (fallback) | sysUpTime, sysName |

Templates are automatically assigned during the first SNMP poll based on the device's `sysObjectID` and `sysDescr` responses. You can also manually assign a template in the device form.

## Appendix B: Monitoring Logic

### Status Determination

```
Ping succeeds → ONLINE (unless SNMP/metric thresholds exceeded)
1 missed ping → remains ONLINE
2 missed pings → WARNING
3 missed pings → OFFLINE (CRITICAL)
```

### SNMP-Based Status Overrides

Certain SNMP values override the ping-based status:

- **UPS battery depleted or low** → OFFLINE regardless of ping
- **UPS on battery power** → WARNING regardless of ping
- **CPU/Memory/Disk above critical threshold** → WARNING
- **Active unresolved alert** → Status held at current level until resolved

### Monitoring Timeline

| Check | Interval | Timeout |
|-------|----------|---------|
| ICMP Ping | 60 seconds | 3 pings, 500ms each |
| SNMP Poll | 300 seconds (5 min) | 10 seconds |
| HTTP Check | 120 seconds | 30 seconds |
| NTP Query | 60 seconds | 5 seconds |

---

*NetMon (Beta) v0.9 — GPL-3.0-or-later*
