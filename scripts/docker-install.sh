#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# NetMon v2 - Docker Compose Quick Setup

set -e

echo "============================================"
echo "  NetMon v2 - Docker Setup"
echo "============================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Create .env from example if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    # Generate a random secret key
    SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i "s/change-this-to-a-secure-random-string-in-production/$SECRET/" .env
    echo "Created .env file with random secret key"
fi

# Generate SSL certs
bash scripts/setup-ssl.sh

echo ""
echo "Starting NetMon v2..."
docker compose up -d --build

echo ""
echo "============================================"
echo "  NetMon v2 is starting!"
echo ""
echo "  Web UI:    https://localhost"
echo "  API Docs:  https://localhost/docs"
echo "  Login:     admin / admin"
echo ""
echo "  Check status: docker compose ps"
echo "  View logs:    docker compose logs -f"
echo "============================================"
