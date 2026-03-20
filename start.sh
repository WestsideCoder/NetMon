#!/bin/bash
# Quick start script for NetMon

set -e

echo "🚀 NetMon - Quick Start"
echo "======================="
echo ""

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; echo "   Install from: https://docs.docker.com/engine/install/"; exit 1; }

# Check for docker compose v2 (plugin), not docker-compose v1
if docker compose version >/dev/null 2>&1; then
    echo "✓ Docker found: $(docker --version)"
    echo "✓ Docker Compose found: $(docker compose version)"
else
    echo "❌ Docker Compose v2 plugin is required but not found."
    echo "   Install from: https://docs.docker.com/engine/install/"
    echo ""
    echo "   Note: The old 'docker-compose' (v1) is not supported."
    echo "   You need the 'docker compose' plugin (v2)."
    exit 1
fi
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    # Generate a random SECRET_KEY
    SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET|" .env
    echo "✓ Generated random SECRET_KEY"
    echo "⚠️  Review .env and set POSTGRES_PASSWORD before running in production!"
    echo ""
fi

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker compose down 2>/dev/null || true
echo ""

# Build and start services
echo "🏗️  Building and starting containers..."
docker compose up -d --build

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo ""
echo "📊 Service Status:"
docker compose ps
echo ""

# Show default credentials
echo "✅ Setup complete!"
echo ""
echo "📍 Access the web UI:"
echo "   http://localhost (or http://<your-server-ip>)"
echo ""
echo "🔑 Default login:"
echo "   Username: admin"
echo "   Password: admin1234"
echo "   (You will be prompted to change this on first login)"
echo ""
echo "💡 Useful commands:"
echo "   - View logs:       docker compose logs -f"
echo "   - Backend logs:    docker compose logs -f backend"
echo "   - Stop services:   docker compose down"
echo "   - Restart:         docker compose restart"
echo ""
