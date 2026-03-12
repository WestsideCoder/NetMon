# 🛠️ Development Guide - Network Monitor V2

## 📦 What's Been Built (Phase 1 - Foundation)

### ✅ Completed

**Infrastructure:**
- Docker Compose stack with 6 services
- PostgreSQL database
- Redis for caching and task queue
- Celery for background jobs
- FastAPI backend framework
- React frontend scaffold (to be built)

**Backend:**
- SQLAlchemy 2.0 models with proper relationships:
  - Site (locations)
  - Device (network devices)
  - SNMPCredential (reusable credentials)
  - SNMPData (time-series metrics)
  - DeviceTemplate (monitoring templates)
  - Alert (alert management)
  - StatusHistory (historical tracking)
  - MaintenanceWindow (alert suppression)
  - User (authentication)

- Configuration management with Pydantic Settings
- Database connection pooling
- Async/sync session factories
- Type hints throughout
- Proper enums for device types, statuses, SNMP versions

**DevOps:**
- Production-ready Dockerfiles
- Poetry for dependency management
- Environment variable configuration
- Health check endpoints
- CORS middleware
- Error handling

### 🚧 Next Steps (Phase 2 - Core Features)

**Backend Services to Build:**
1. **Ping Service** (`app/services/ping.py`)
   - ICMP ping implementation
   - Async batch ping
   - Response time calculation

2. **SNMP Service** (`app/services/snmp.py`)
   - SNMPv1/v2c/v3 support
   - OID polling
   - Value parsing and formatting
   - Credential testing

3. **Discovery Service** (`app/services/discovery.py`)
   - Network scanning
   - Device type detection
   - Automatic credential testing
   - Bulk device import

4. **Alert Service** (`app/services/alerting.py`)
   - Alert rule evaluation
   - Email notifications
   - Webhook delivery
   - Maintenance window checking

**API Routes to Build:**
1. `/api/auth` - Authentication (login, register, tokens)
2. `/api/devices` - Device CRUD
3. `/api/sites` - Site management
4. `/api/monitoring` - Status endpoints
5. `/api/snmp` - SNMP configuration
6. `/api/alerts` - Alert management

**Celery Tasks:**
1. `tasks/monitoring.py` - Ping monitoring loop
2. `tasks/snmp_poll.py` - SNMP polling
3. `tasks/alerts.py` - Alert processing

**Frontend (Complete Build Required):**
- React + TypeScript setup
- Vite configuration
- TailwindCSS styling
- Component library
- State management
- WebSocket integration

---

## 🚀 Getting Started

### Prerequisites

```bash
# Required
docker --version          # 20.10+
docker-compose --version  # 2.0+
git --version            # 2.0+

# Optional (for local development)
python --version         # 3.11+
poetry --version         # 1.7+
node --version          # 18+
npm --version           # 9+
```

### Initial Setup

1. **Clone and navigate**
```bash
cd netmon-v2
```

2. **Create environment file**
```bash
cp .env.example .env

# Edit .env with your settings
nano .env
```

3. **Start services**
```bash
# Build and start all containers
docker-compose up --build -d

# Watch logs
docker-compose logs -f
```

4. **Verify services**
```bash
# Check all services are healthy
docker-compose ps

# Should see:
# netmon-db           Up (healthy)
# netmon-redis        Up (healthy)
# netmon-backend      Up
# netmon-celery-worker   Up
# netmon-celery-beat    Up
# netmon-frontend      Up
```

5. **Access services**
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Frontend: http://localhost:3000 (when built)
- Database: localhost:5432

---

## 💻 Development Workflow

### Backend Development

```bash
# Enter backend container
docker-compose exec backend bash

# Install new dependency
poetry add package-name

# Run tests
pytest

# Check types
mypy app/

# Format code
black app/
ruff check app/

# Interactive Python
python
>>> from app.database import async_engine
>>> from app.models import Device
```

### Database Migrations

```bash
# Create migration
docker-compose exec backend alembic revision --autogenerate -m "add column"

# Apply migrations
docker-compose exec backend alembic upgrade head

# Rollback
docker-compose exec backend alembic downgrade -1

# View history
docker-compose exec backend alembic history
```

### Database Access

```bash
# PostgreSQL CLI
docker-compose exec db psql -U netmon -d netmon

# Run query
netmon=# SELECT * FROM devices;

# Redis CLI
docker-compose exec redis redis-cli

# Check keys
127.0.0.1:6379> KEYS *
```

---

## 📝 Code Examples

### Creating a New API Route

```python
# app/api/devices.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Device
from app.schemas.device import DeviceCreate, DeviceResponse

router = APIRouter()

@router.get("/", response_model=list[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """List all devices with pagination."""
    result = await db.execute(
        select(Device).offset(skip).limit(limit)
    )
    devices = result.scalars().all()
    return devices

@router.post("/", response_model=DeviceResponse, status_code=201)
async def create_device(
    device: DeviceCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new device."""
    db_device = Device(**device.dict())
    db.add(db_device)
    await db.commit()
    await db.refresh(db_device)
    return db_device
```

### Creating a Pydantic Schema

```python
# app/schemas/device.py
from pydantic import BaseModel, IPvAnyAddress
from typing import Optional
from datetime import datetime

class DeviceBase(BaseModel):
    name: str
    ip_address: IPvAnyAddress
    device_type: Optional[str] = None
    site_id: int

class DeviceCreate(DeviceBase):
    pass

class DeviceResponse(DeviceBase):
    id: int
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True  # Allows ORM model conversion
```

### Creating a Service

```python
# app/services/ping.py
import asyncio
from typing import Tuple

async def ping_device(ip: str, timeout: int = 2) -> Tuple[bool, Optional[float]]:
    """
    Ping a device and return (is_online, response_time).
    
    Returns:
        (True, response_time_ms) if online
        (False, None) if offline
    """
    try:
        process = await asyncio.create_subprocess_exec(
            'ping', '-c', '1', '-W', str(timeout), ip,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        
        if process.returncode == 0:
            # Parse response time from output
            output = stdout.decode()
            # Extract time=X.XXX ms
            time_str = output.split('time=')[1].split(' ')[0]
            response_time = float(time_str)
            return True, response_time
        else:
            return False, None
    except Exception:
        return False, None
```

### Creating a Celery Task

```python
# app/tasks/monitoring.py
from celery import shared_task
from app.database import get_sync_db
from app.models import Device
from app.services.ping import ping_device
import asyncio

@shared_task(name="monitor_all_devices")
def monitor_all_devices():
    """Background task to ping all devices."""
    db = next(get_sync_db())
    
    devices = db.query(Device).filter(
        Device.maintenance_mode == False
    ).all()
    
    for device in devices:
        # Run async ping in sync context
        is_online, response_time = asyncio.run(
            ping_device(device.ip_address)
        )
        
        # Update device status
        if is_online:
            device.status = "online"
            device.response_time = response_time
            device.consecutive_failures = 0
        else:
            device.consecutive_failures += 1
            if device.consecutive_failures >= 3:
                device.status = "offline"
        
        db.commit()
```

---

## 🧪 Testing

### Running Tests

```bash
# All tests
docker-compose exec backend pytest

# With coverage
docker-compose exec backend pytest --cov=app

# Specific test file
docker-compose exec backend pytest tests/test_devices.py

# With output
docker-compose exec backend pytest -v -s
```

### Writing Tests

```python
# tests/test_devices.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_device():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/devices/",
            json={
                "name": "Test Switch",
                "ip_address": "192.168.1.1",
                "site_id": 1
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Switch"
        assert "id" in data
```

---

## 🏗️ Architecture Decisions

### Why FastAPI?
- Async support (handles concurrent requests efficiently)
- Automatic API documentation
- Type hints and validation with Pydantic
- Modern Python 3.11+ features
- WebSocket support built-in

### Why SQLAlchemy 2.0?
- Type-safe queries
- Async support
- Relationship management
- Migration tooling (Alembic)
- Better than raw SQL for complex queries

### Why Celery + Redis?
- Distributed task processing
- Retry logic
- Scheduled tasks (monitoring loops)
- Separate from web requests
- Scalable workers

### Why PostgreSQL?
- Robust and reliable
- JSON support for flexible data
- Full-text search
- Concurrent connections
- Better than SQLite for production

---

## 📊 Monitoring the Monitor

### Application Logs

```bash
# Backend logs
docker-compose logs -f backend

# Celery worker logs
docker-compose logs -f celery-worker

# All logs
docker-compose logs -f
```

### Database Queries

```sql
-- Recent devices
SELECT name, ip_address, status, last_seen 
FROM devices 
ORDER BY created_at DESC 
LIMIT 10;

-- Device counts by status
SELECT status, COUNT(*) 
FROM devices 
GROUP BY status;

-- Recent alerts
SELECT d.name, a.severity, a.message, a.triggered_at
FROM alerts a
JOIN devices d ON a.device_id = d.id
WHERE a.status = 'active'
ORDER BY a.triggered_at DESC;
```

---

## 🚨 Common Issues

### Port Already in Use
```bash
# Find process
lsof -i :8000
# or
netstat -tulpn | grep 8000

# Kill it
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Database Connection Errors
```bash
# Reset database
docker-compose down -v
docker-compose up -d db
# Wait for it to be healthy
docker-compose up -d
```

### Celery Not Processing
```bash
# Check Celery worker logs
docker-compose logs celery-worker

# Restart worker
docker-compose restart celery-worker

# Check Redis
docker-compose exec redis redis-cli ping
```

---

## 📚 Resources

- FastAPI Docs: https://fastapi.tiangolo.com
- SQLAlchemy 2.0: https://docs.sqlalchemy.org/en/20/
- Pydantic: https://docs.pydantic.dev
- Celery: https://docs.celeryq.dev
- Alembic: https://alembic.sqlalchemy.org

---

## 🎯 Next Session Plan

**Priority 1: Core Monitoring**
1. Implement ping service
2. Create device API routes
3. Build monitoring Celery task
4. Test ping monitoring end-to-end

**Priority 2: SNMP**
1. Implement SNMP service
2. Create device templates
3. Build SNMP polling task
4. Test with real device

**Priority 3: Frontend**
1. Set up React + TypeScript
2. Create dashboard page
3. Build device list component
4. Connect to backend API

**Time Estimate:** 3-4 hours for Priority 1 & 2, 4-5 hours for Priority 3

---

**You now have a solid, professional foundation. The architecture is clean, scalable, and production-ready. Next session, we build the features!** 🚀
