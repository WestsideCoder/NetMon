# Network Monitor V2 - Complete Project Documentation

## Table of Contents
1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [API Reference](#api-reference)
6. [Development](#development)
7. [Future Enhancements](#future-enhancements)

---

## Overview

Network Monitor V2 is a full-stack network monitoring platform built with modern technologies for enterprise-grade device monitoring and management.

**Tech Stack:**
- **Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, Celery
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Infrastructure:** Docker, PostgreSQL 15, Redis 7
- **Created:** February 2026

---

## Core Features

### 1. Real-Time Device Monitoring
- Automated ping checks every 60 seconds
- Status tracking: Online, Warning, Offline, Unknown
- Response time measurement
- Uptime statistics (consecutive failures, total checks, success rate)
- Maintenance mode to pause monitoring

### 2. Hierarchical Site Management
- Up to 4 levels of organization (Campus → Building → Floor → Room)
- Color-coded visual hierarchy
- Parent-child relationships with automatic level calculation
- Expand/collapse tree view
- Cascade delete protection
- Circular reference prevention

### 3. SNMP Integration
- SNMPv2c and SNMPv3 credential storage
- Live credential testing
- Auto-discovery: hostname, system description, uptime
- Automatic device type detection
- Multi-credential testing during scans

### 4. Network Scanner
- IP range scanning (CIDR: 10.0.0.0/24 or range: 10.0.0.1-10.0.0.50)
- Ping-based device discovery
- SNMP auto-discovery for hostname and type
- Smart naming (SNMP hostname or "Device-[IP]")
- Bulk device import
- Duplicate prevention
- Detailed scan results with response times

### 5. Interactive Dashboard
- Live device statistics
- Sortable device table
- Status indicators with emojis
- Auto-refresh every 30 seconds
- Quick add/edit/delete actions

---

## Architecture

### Project Structure
```
netmon-v2/
├── backend/
│   ├── app/
│   │   ├── api/              # REST API endpoints
│   │   │   ├── devices.py
│   │   │   ├── sites.py
│   │   │   ├── snmp.py
│   │   │   └── scanner.py
│   │   ├── models/           # Database models
│   │   │   ├── device.py
│   │   │   ├── site.py
│   │   │   └── snmp.py
│   │   ├── schemas/          # Pydantic validation
│   │   ├── services/         # Business logic
│   │   │   ├── scanner.py
│   │   │   └── snmp.py
│   │   ├── tasks/            # Celery background tasks
│   │   │   └── ping.py
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DeviceList.tsx
│   │   │   ├── DeviceForm.tsx
│   │   │   ├── SitesManagement.tsx
│   │   │   ├── NetworkScanner.tsx
│   │   │   └── SNMPSettings.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   │   └── App.tsx
│   └── package.json
└── docker-compose.yml
```

### Database Schema

**sites**
```sql
- id (PK)
- name
- location
- description
- parent_site_id (FK → sites.id)
- level (1-4)
- map_image_url
- map_config (JSON)
- created_at
- updated_at
```

**devices**
```sql
- id (PK)
- name
- ip_address (unique)
- device_type (enum)
- mac_address
- site_id (FK → sites.id)
- vlan
- status (enum: ONLINE, WARNING, OFFLINE, UNKNOWN)
- response_time
- last_seen
- last_check
- consecutive_failures
- total_checks
- successful_checks
- snmp_enabled
- snmp_credential_id (FK → snmp_credentials.id)
- monitor_http
- monitor_https
- http_status
- https_status
- map_x, map_y
- maintenance_mode
- maintenance_until
- notes
- created_at
- updated_at
```

**snmp_credentials**
```sql
- id (PK)
- name
- description
- version (V2C or V3)
- community (for V2C)
- username (for V3)
- auth_protocol
- auth_password
- priv_protocol
- priv_password
- enabled
- created_at
- updated_at
```

---

## Installation

### Prerequisites
- Docker & Docker Compose
- 4GB RAM minimum
- Ports available: 3000, 8000, 5432, 6379

### Quick Start
```bash
cd ~/netmon-v2
docker compose up -d
```

Access the application at: **http://localhost:3000**

### Services
- **frontend** - React app (port 3000)
- **backend** - FastAPI (port 8000)
- **db** - PostgreSQL 15 (port 5432)
- **redis** - Redis 7 (port 6379)
- **celery-worker** - Background task processor
- **celery-beat** - Task scheduler

### Stopping Services
```bash
docker compose down
```

---

## API Reference

### Devices API (`/api/devices/`)

**List Devices**
```http
GET /api/devices/
Response: Array of Device objects
```

**Get Statistics**
```http
GET /api/devices/stats
Response: { total, online, warning, offline, unknown }
```

**Create Device**
```http
POST /api/devices/
Body: {
  name, ip_address, device_type, site_id,
  vlan?, snmp_enabled?, snmp_credential_id?,
  monitor_http?, monitor_https?
}
```

**Update Device**
```http
PUT /api/devices/{id}
Body: Partial device fields
```

**Delete Device**
```http
DELETE /api/devices/{id}
```

### Sites API (`/api/sites/`)

**List Sites**
```http
GET /api/sites/
Query params:
  - include_all=true (return all sites, not just top-level)
  - parent_site_id=N (filter by parent)
  - level=N (filter by level 1-4)
```

**Get Site Tree**
```http
GET /api/sites/tree
Response: Nested site hierarchy
```

**Create Site**
```http
POST /api/sites/
Body: {
  name, location?, description?,
  parent_site_id?
}
```

**Update Site**
```http
PUT /api/sites/{id}
Body: Partial site fields
```

**Delete Site**
```http
DELETE /api/sites/{id}
Note: Fails if site has devices or children
```

### SNMP API (`/api/snmp/`)

**List Credentials**
```http
GET /api/snmp/credentials
```

**Test Credential**
```http
POST /api/snmp/test
Body: { ip_address, credential_id }
Response: { success, message, sys_name, sys_descr, detected_type }
```

### Scanner API (`/api/scanner/`)

**Scan Network**
```http
POST /api/scanner/scan
Body: {
  ip_range: "10.0.0.0/24" or "10.0.0.1-10.0.0.50",
  site_id,
  default_device_type?,
  test_snmp: true,
  snmp_credential_ids: [1, 2],
  vlan?
}
Response: {
  total_ips, responding, snmp_devices,
  added_devices, skipped_existing,
  results: Array of scan results
}
```

---

## Development

### Running Locally
```bash
# Start all services
docker compose up -d

# View backend logs
docker compose logs backend -f

# View frontend logs
docker compose logs frontend -f

# Access database
docker compose exec db psql -U netmon -d netmon

# Access Redis CLI
docker compose exec redis redis-cli
```

### Adding a New Feature

1. **Backend:**
   - Update model in `backend/app/models/`
   - Add schema in `backend/app/schemas/`
   - Create API endpoint in `backend/app/api/`
   - Add business logic in `backend/app/services/`

2. **Frontend:**
   - Create component in `frontend/src/components/`
   - Update `api.ts` with new API calls
   - Add types to `types.ts`
   - Wire up in `App.tsx`

3. **Database:**
   - Modify model
   - Run ALTER TABLE manually (no migrations yet)
   - Restart backend

### Background Tasks

**Celery Beat Schedule** (in `backend/app/tasks/__init__.py`):
```python
{
    'ping-devices': {
        'task': 'app.tasks.ping.ping_devices',
        'schedule': 60.0,  # Every 60 seconds
    }
}
```

---

## Key Implementation Details

### Volume Mounts
- Backend and frontend code mounted as volumes for hot reload
- Some changes require container restart (especially model changes)
- Files created in container may need host sync

### SNMP Scanner Bridge
The scanner bridges async (FastAPI) with sync (pysnmp library):
- `test_snmp_creds_async` - Async wrapper function
- Fetches credentials from DB asynchronously
- Calls synchronous `test_snmp_credentials` from snmp.py
- Returns tuple: (success, credential_id, hostname, device_type, sys_descr)

### Site Hierarchy Logic
- Self-referential foreign key: parent_site_id → sites.id
- Level auto-calculated: parent.level + 1 (max 4)
- Frontend builds tree from flat list
- Validation prevents circular references
- Cascade delete prevented if children/devices exist

### Device Schema Evolution
Added monitor_http/monitor_https fields:
1. ALTER TABLE devices ADD COLUMN monitor_http BOOLEAN DEFAULT false
2. ALTER TABLE devices ADD COLUMN monitor_https BOOLEAN DEFAULT false
3. Updated Device model (required container file edit due to volume mount)
4. Updated DeviceResponse schema
5. Restarted backend

---

## Future Enhancements

### Planned Features
1. **Visual Maps**
   - Upload floor plans
   - Drag-and-drop device positioning
   - Map-based navigation
   - Device clustering

2. **HTTP/HTTPS Monitoring**
   - Active web endpoint checks
   - SSL certificate validation
   - Response time tracking
   - Status code monitoring

3. **Alerting System**
   - Email notifications
   - Slack integration
   - Webhook support
   - Alert rules and thresholds

4. **Historical Data & Reporting**
   - Uptime graphs
   - Response time trends
   - Availability reports
   - Export to CSV/PDF

5. **User Authentication**
   - Login system
   - Role-based access control (Admin, Operator, Viewer)
   - Audit logging
   - API keys for automation

6. **Advanced Features**
   - VLAN auto-discovery
   - Batch device operations
   - Custom device types
   - Scheduled maintenance windows
   - Device groups/tags
   - Search and filtering

### Technical Improvements
- Implement Alembic migrations
- Add Sentry for error tracking
- WebSocket for real-time updates
- Performance optimization for 1000+ devices
- Multi-stage Docker builds for production
- HTTPS/TLS support
- Automated backups

---

## Troubleshooting

### Backend Not Starting
```bash
# Check logs
docker compose logs backend

# Common issues:
# - Database connection failed: Check db service is healthy
# - Import errors: Check if all Python packages installed
# - Port conflict: Ensure port 8000 is available
```

### Frontend Build Errors
```bash
# Check logs
docker compose logs frontend

# Common issues:
# - TypeScript errors: Check component imports
# - Module not found: npm install may have failed
# - Port conflict: Ensure port 3000 is available
```

### Database Issues
```bash
# Connect to database
docker compose exec db psql -U netmon -d netmon

# Check tables
\dt

# View devices
SELECT id, name, ip_address, status FROM devices;

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up -d
```

### Monitoring Not Working
```bash
# Check Celery worker is running
docker compose ps

# Check Celery logs
docker compose logs celery-worker -f

# Check Redis is accessible
docker compose exec redis redis-cli ping
```

---

## Performance Considerations

### Current Limitations
- Sequential network scanning (slow for large ranges)
- No pagination on device list (may slow down with 1000+ devices)
- Synchronous SNMP calls (blocks during scans)

### Optimization Strategies
- Implement async SNMP library
- Add parallel scanning (thread pool or asyncio.gather)
- Paginate device API responses
- Index frequently queried fields
- Cache SNMP results
- Implement device grouping for large deployments

---

## Security Notes

### Current State
⚠️ **No authentication implemented** - System is open to network access

### Production Recommendations
1. Implement user authentication
2. Use HTTPS (reverse proxy with Let's Encrypt)
3. Secure SNMP credentials (encryption at rest)
4. Network isolation (firewall rules)
5. Regular security updates
6. Audit logging
7. Rate limiting on API endpoints

---

## Contributing

### Code Style
- **Python:** PEP 8, type hints, docstrings
- **TypeScript:** ESLint, Prettier
- **React:** Functional components, hooks

### Testing
Currently no automated tests. Future:
- Backend: pytest with async support
- Frontend: Jest + React Testing Library
- E2E: Playwright or Cypress

---

## License

This project was created for internal use. License TBD.

---

## Credits

**Developed:** February 2026  
**Technologies:** FastAPI, React, PostgreSQL, Redis, Celery, Docker

---

## Support & Contact

For issues:
- Check logs: `docker compose logs <service> -f`
- Database: `docker compose exec db psql -U netmon -d netmon`
- Browser console (F12) for frontend errors

---

**Happy Monitoring! 🚀**
