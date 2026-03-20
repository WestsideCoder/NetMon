# NetMon (Beta) v0.9

---

## 📋 Features

### Core Monitoring
- ✅ **Ping Monitoring** - Continuous ICMP monitoring with configurable intervals
- ✅ **SNMP Monitoring** - Full SNMPv1/v2c/v3 support with device templates
- ✅ **Auto-Discovery** - Network scanning with automatic device identification
- ✅ **Real-Time Updates** - WebSocket-based live dashboard updates
- ✅ **Smart Alerting** - Email, webhook, and in-app notifications
- ✅ **Historical Data** - Time-series storage for trend analysis

### Device Support
- 🔋 **UPS** - Battery status, runtime, load, power source alerts
- 🔌 **Network Switches** - CPU, memory, temperature monitoring
- 🌐 **Routers** - Interface stats, routing table health
- 💻 **Servers** - System metrics, process monitoring
- 📷 **Cameras** - Connectivity and availability
- 📡 **Access Points** - Client counts, signal strength

### Advanced Features
- 🗺️ **Interactive Maps** - Drag-drop device placement on floor plans
- 👥 **User Authentication** - Role-based access control (Admin/Operator/Viewer)
- 📊 **Reports** - PDF/CSV export of monitoring data
- 🔧 **Maintenance Windows** - Scheduled alert suppression
- 🔐 **API Tokens** - Programmatic access for integrations
- 🌙 **Dark Mode** - Eye-friendly UI for NOC environments

---

## 🏗️ Architecture

### Technology Stack

**Backend:**
- FastAPI (Python 3.11+) - High-performance async API
- SQLAlchemy 2.0 - Modern ORM with type hints
- PostgreSQL - Production database
- Celery + Redis - Distributed task queue
- Alembic - Database migrations
- Pydantic - Data validation

**Frontend:**
- React 18 + TypeScript - Type-safe UI
- Vite - Lightning-fast build tool
- TailwindCSS - Utility-first styling
- React Query - Server state management
- Zustand - Client state management
- WebSocket - Real-time communication (native)

**Infrastructure:**
- Docker + Docker Compose - Containerization
- Poetry - Python dependency management
- PostgreSQL 15 - Relational database
- Redis 7 - Cache and message broker

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐ │
│  │Dashboard │  │ Devices   │  │  SNMP    │  │  Settings  │ │
│  │          │  │ & Sites   │  │ Monitor  │  │  & Alerts  │ │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                     FastAPI Backend                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ API Routes   │  │  Services    │  │  WebSocket   │      │
│  │ /devices     │  │  - Ping      │  │  Handler     │      │
│  │ /sites       │  │  - SNMP      │  │              │      │
│  │ /monitoring  │  │  - Discovery │  │              │      │
│  │ /alerts      │  │  - Alerting  │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
┌─────▼──────┐   ┌───────▼───────┐   ┌─────▼──────┐
│ PostgreSQL │   │ Celery Workers│   │   Redis    │
│            │   │ - Ping tasks  │   │ - Queue    │
│ - Devices  │   │ - SNMP polls  │   │ - Cache    │
│ - SNMP     │   │ - Discovery   │   │ - Sessions │
│ - Alerts   │   │ - Alerts      │   │            │
│ - History  │   │               │   │            │
└────────────┘   └───────────────┘   └────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker Engine** + **Docker Compose v2** (the `docker compose` plugin, **not** the old `docker-compose` v1 package)
  - Install from the official docs: https://docs.docker.com/engine/install/
  - After installing, verify: `docker compose version`
- Git
- 4GB RAM minimum
- Ports available: **80** (required — web UI), 443 (HTTPS optional)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/WestsideCoder/NetMon.git
cd NetMon
```

2. **Configure environment**
```bash
cp .env.example .env
```
Edit `.env` and set at minimum:
- `SECRET_KEY` — a long random string (required for production)
- `POSTGRES_PASSWORD` — database password

3. **Start all services**
```bash
docker compose up -d
```

4. **Access the application**

Open your browser to **port 80** (not 8000):
- Local: **http://localhost**
- Remote: **http://&lt;your-server-ip&gt;**

> **Note:** Port 8000 serves only the raw backend API (JSON). The full web UI is served by nginx on port 80, which reverse-proxies API requests to the backend automatically.

5. **Log in**
- Username: `admin`
- Password: `admin1234`
- You will be prompted to change your password on first login.
- You can also confirm the credentials in the backend logs:
  ```bash
  docker compose logs backend | grep "DEFAULT ADMIN"
  ```

---

## 📁 Project Structure

```
netmon-v2/
├── docker-compose.yml          # Service orchestration
├── .env.example                # Environment template
├── README.md                   # This file
│
├── backend/                    # Python FastAPI backend
│   ├── Dockerfile
│   ├── pyproject.toml         # Poetry dependencies
│   ├── alembic.ini            # Migration config
│   │
│   ├── app/
│   │   ├── main.py            # FastAPI application
│   │   ├── config.py          # Settings
│   │   ├── database.py        # DB connection
│   │   │
│   │   ├── models/            # SQLAlchemy models
│   │   │   ├── device.py      # Device entity
│   │   │   ├── site.py        # Site/location
│   │   │   ├── snmp.py        # SNMP config
│   │   │   ├── alert.py       # Alert rules
│   │   │   └── user.py        # Authentication
│   │   │
│   │   ├── schemas/           # Pydantic schemas
│   │   │   ├── device.py
│   │   │   ├── snmp.py
│   │   │   └── alert.py
│   │   │
│   │   ├── api/               # API routes
│   │   │   ├── devices.py
│   │   │   ├── sites.py
│   │   │   ├── monitoring.py
│   │   │   └── alerts.py
│   │   │
│   │   ├── services/          # Business logic
│   │   │   ├── ping.py        # ICMP monitoring
│   │   │   ├── snmp.py        # SNMP operations
│   │   │   ├── discovery.py   # Network scanning
│   │   │   └── alerting.py    # Alert processing
│   │   │
│   │   ├── tasks/             # Celery tasks
│   │   │   ├── monitoring.py  # Background monitoring
│   │   │   ├── snmp_poll.py   # SNMP polling
│   │   │   └── alerts.py      # Alert delivery
│   │   │
│   │   ├── core/              # Utilities
│   │   │   ├── security.py    # Auth helpers
│   │   │   ├── logging.py     # Logging config
│   │   │   └── websocket.py   # WS manager
│   │   │
│   │   └── templates/         # Device templates
│   │       ├── ups.py
│   │       ├── switch.py
│   │       ├── router.py
│   │       └── server.py
│   │
│   ├── tests/                 # Pytest tests
│   │   ├── test_devices.py
│   │   ├── test_snmp.py
│   │   └── test_monitoring.py
│   │
│   └── alembic/              # Database migrations
│       └── versions/
│
├── frontend/                  # React TypeScript frontend
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   │
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       │
│       ├── components/       # Reusable components
│       │   ├── Dashboard/
│       │   ├── DeviceList/
│       │   ├── SNMPMonitor/
│       │   ├── Maps/
│       │   └── Common/
│       │
│       ├── pages/           # Route pages
│       │   ├── Dashboard.tsx
│       │   ├── Devices.tsx
│       │   ├── Sites.tsx
│       │   └── Settings.tsx
│       │
│       ├── hooks/           # Custom hooks
│       │   ├── useDevices.ts
│       │   ├── useSNMP.ts
│       │   └── useWebSocket.ts
│       │
│       ├── services/        # API client
│       │   └── api.ts
│       │
│       ├── store/           # State management
│       │   └── devices.ts
│       │
│       └── types/           # TypeScript types
│           └── device.ts
│
└── docs/                    # Documentation
    ├── API.md
    ├── DEPLOYMENT.md
    └── DEVELOPMENT.md
```

---

## 🔧 Development

### Backend Development

```bash
# Enter backend container
docker compose exec backend bash

# Run tests
pytest

# Create migration
alembic revision --autogenerate -m "description"

# Apply migration
alembic upgrade head

# Format code
black app/
ruff check app/

# Type checking
mypy app/
```

### Frontend Development

```bash
# Enter frontend container
docker compose exec frontend sh

# Run tests
npm test

# Build for production
npm run build

# Lint
npm run lint
```

---

## 📊 Monitoring Workflow

### 1. Add Devices

**Manual Entry:**
- Navigate to Devices → Add Device
- Enter IP, name, type, site
- Configure SNMP if needed
- Save

**Network Scan:**
- Navigate to Discovery → VLAN Scan
- Enter IP range (CIDR notation)
- System automatically:
  - Pings each IP
  - Tests SNMP credentials
  - Identifies device type
  - Suggests templates

### 2. Configure SNMP

**Using Credentials:**
- Navigate to Settings → SNMP Credentials
- Add credential sets (v2c/v3)
- Assign to devices or use in scans

**Using Templates:**
- Device type detected automatically
- Template applied with one click
- All relevant OIDs added
- Alert thresholds pre-configured

### 3. Monitor Status

**Dashboard:**
- Real-time status overview
- Online/Warning/Offline counts
- Recent alerts
- Quick actions

**SNMP Monitor:**
- Select device
- View all metrics
- Color-coded cards
- Active alerts highlighted

**Maps:**
- Visual device placement
- Status indicated by color
- Click for details
- Drag to reposition

### 4. Handle Alerts

**Email:**
- Configured in Settings
- Multiple recipients
- Customizable templates
- Cooldown periods

**Webhooks:**
- Slack, Teams, Discord
- Custom payloads
- Retry logic
- Delivery confirmation

---

## 🔒 Security

### Authentication
- JWT-based auth
- Role-based access control
- Token expiration
- Secure password hashing (bcrypt)

### Network Security
- SNMP credentials encrypted at rest
- TLS for SMTP
- HTTPS-ready (reverse proxy)
- CORS configuration

### Best Practices
- Change default SECRET_KEY
- Use strong database passwords
- Rotate API tokens regularly
- Enable audit logging
- Use maintenance mode for changes

---

## 📈 Performance

### Optimization
- Database connection pooling
- Redis caching for frequent queries
- Async operations throughout
- Batch SNMP polling
- WebSocket for real-time updates (no polling)

### Scaling
- Horizontal Celery worker scaling
- Database read replicas
- Redis Sentinel for HA
- Load balancer ready
- Prometheus metrics export

---

## 🐛 Troubleshooting

### I see JSON instead of the web UI
You are hitting the backend API directly on port 8000. The web UI is served by nginx on **port 80**. Open `http://localhost` (no port) or `http://<your-server-ip>` instead.

### Services won't start
```bash
# Check logs
docker compose logs backend
docker compose logs celery-worker
docker compose logs nginx

# Reset everything
docker compose down -v
docker compose up -d
```

### Database migration issues
```bash
# Check current version
docker compose exec backend alembic current

# Downgrade one revision
docker compose exec backend alembic downgrade -1

# Upgrade to latest
docker compose exec backend alembic upgrade head
```

### "docker-compose" command not found
NetMon requires **Docker Compose v2** (the `docker compose` plugin), not the legacy standalone `docker-compose` (v1). If you see errors with `docker-compose`, use `docker compose` (with a space) instead. Install Docker Engine with the compose plugin from: https://docs.docker.com/engine/install/

### SNMP not working
1. Verify credentials in Settings
2. Test from command line: `snmpget -v2c -c public <IP> sysDescr.0`
3. Check firewall (UDP port 161)
4. Enable debug logging in config
5. Check Celery worker logs

---

## 📝 License

GPL-3.0-or-later

---

## 📞 Support

- Documentation: [docs/](docs/)
- Issues: GitHub Issues

---

**Built with ❤️ for network administrators who deserve better tools.**
