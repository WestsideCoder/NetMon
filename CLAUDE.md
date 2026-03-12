# NetMon — Claude Code Guide

## What is this?
NetMon is a network monitoring tool (Beta v0.9) built with FastAPI + React. It monitors devices via ICMP ping, SNMP, HTTP checks, syslog, and SNMP traps.

## Project Structure
```
export/
├── backend/app/          # FastAPI backend (Python 3.11, Poetry)
│   ├── main.py           # App entry, startup, WebSocket, Redis bridge
│   ├── config.py         # Pydantic Settings (all env vars defined here)
│   ├── core/
│   │   ├── security.py   # PyJWT auth, bcrypt, Redis token blocklist
│   │   └── encryption.py # Fernet encryption for SNMP credentials
│   ├── models/           # SQLAlchemy models (PostgreSQL + TimescaleDB)
│   ├── schemas/          # Pydantic request/response schemas
│   ├── api/              # FastAPI route files
│   ├── services/         # Business logic (ssl_service, etc.)
│   └── tasks/            # Celery tasks (ping, SNMP polling, HTTP checks)
├── frontend/src/         # React 18, TypeScript, Vite, Tailwind CSS, Zustand
│   ├── App.tsx           # Routes, ProtectedRoute
│   ├── api/client.ts     # Axios API client
│   ├── store/            # Zustand state stores
│   ├── hooks/            # Custom hooks (useWebSocket, etc.)
│   ├── components/       # UI components
│   └── pages/            # Page components
├── nginx/nginx.conf      # Reverse proxy with SSL, rate limiting, CSP
├── docker-compose.yml    # Dev environment
├── docker-compose.prod.yml # Prod overrides
└── .env.example          # Environment variable template
```

## Tech Stack
- **Backend**: FastAPI, SQLAlchemy (async), Celery + Redis, PostgreSQL 15
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Auth**: PyJWT (access + refresh tokens), bcrypt, Redis JTI blocklist
- **Infra**: Docker Compose, Nginx, tecnativa/docker-socket-proxy

## Development Setup
```bash
cp .env.example .env
# Edit .env — at minimum set SECRET_KEY and POSTGRES_PASSWORD
docker compose up -d
```
- Frontend: http://localhost (via nginx)
- Backend API: http://localhost:8000
- Default login: admin / admin1234 (forced password change on first login)

## Key Commands
```bash
# Restart backend after code changes (volume-mounted, but needs restart)
docker compose restart backend celery-worker celery-beat

# Production frontend build (MUST override dev env vars)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm -e VITE_API_URL= -e VITE_WS_URL= frontend sh -c "npm run build"

# View backend logs
docker logs -f netmon-backend

# Access database
docker exec -it netmon-db psql -U netmon -d netmon
```

## Conventions
- Percentage charts: Y-axis fixed 0–100 (`maxY={100}`)
- File uploads: validate extension against `ALLOWED_IMAGE_EXTENSIONS` allowlist
- Passwords: minimum 8 characters enforced in schemas
- SNMP credentials: encrypted at rest via Fernet (derived from SECRET_KEY)
- WebSocket: requires JWT token as `?token=` query param
- IP inputs for scanner/ping: validated via `ipaddress.ip_address()` before subprocess

## Architecture Notes
- Auth roles: admin, operator, viewer
- `must_change_password` flag forces password change modal on login
- SSL cert private keys stored in `/app/ssl_store` (not static-served)
- Docker socket access via proxy container (not direct mount)
- Prod compose: DB/Redis/backend ports not exposed; API docs disabled
- SECRET_KEY startup check: refuses to boot in prod with default key
- Login rate limiting: 10 attempts / 5 min per IP

## Environment Variables
All env vars are defined in `backend/app/config.py`. See `.env.example` for the full list.
Critical ones: `SECRET_KEY`, `POSTGRES_PASSWORD`, `DATABASE_URL`.

## Database
- PostgreSQL 15 with optional TimescaleDB for time-series (hypertables for snmp_data, status_history, syslog_entries, snmp_traps)
- Migrations: Alembic (`backend/alembic/`)
- Tables auto-created on startup via `Base.metadata.create_all`
