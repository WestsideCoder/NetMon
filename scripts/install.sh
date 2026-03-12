#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# NetMon v2 - Ubuntu Installation Script
# Supports Ubuntu 22.04 and 24.04

set -e

echo "============================================"
echo "  NetMon v2 - Network Monitoring System"
echo "  Installation Script"
echo "============================================"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Check Ubuntu
if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
    echo "Warning: This script is designed for Ubuntu."
fi

echo "Installing system dependencies..."

apt-get update
apt-get install -y \
    postgresql postgresql-contrib \
    redis-server \
    nginx \
    fping \
    snmp snmp-mibs-downloader \
    python3 python3-pip python3-venv \
    curl wget git openssl

# TimescaleDB
echo "Installing TimescaleDB..."
if ! dpkg -l | grep -q timescaledb; then
    apt-get install -y gnupg lsb-release
    echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -cs) main" \
        > /etc/apt/sources.list.d/timescaledb.list
    wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add - 2>/dev/null || true
    apt-get update
    apt-get install -y timescaledb-2-postgresql-15 || echo "TimescaleDB install failed, continuing..."
fi

# Create netmon user
echo "Creating netmon system user..."
id -u netmon &>/dev/null || useradd -r -m -s /bin/bash netmon

# Create directories
mkdir -p /usr/share/netmon
mkdir -p /etc/netmon
mkdir -p /var/lib/netmon
mkdir -p /var/log/netmon

# Setup PostgreSQL
echo "Setting up PostgreSQL..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='netmon'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER netmon WITH PASSWORD 'changeme';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='netmon'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE netmon OWNER netmon;"
sudo -u postgres psql -d netmon -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" 2>/dev/null || true

# Interactive config
echo ""
echo "--- Configuration ---"
read -p "Admin password [admin]: " ADMIN_PW
ADMIN_PW=${ADMIN_PW:-admin}

read -p "Database password [changeme]: " DB_PW
DB_PW=${DB_PW:-changeme}

# Write config
cat > /etc/netmon/config.env <<EOF
DATABASE_URL=postgresql://netmon:${DB_PW}@localhost:5432/netmon
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=$(openssl rand -hex 32)
ENVIRONMENT=production
DEBUG=false
PING_INTERVAL=60
SNMP_POLL_INTERVAL=300
EOF

chmod 600 /etc/netmon/config.env
chown netmon:netmon /etc/netmon/config.env

# Generate SSL certs
bash "$(dirname "$0")/setup-ssl.sh"

# Set permissions
chown -R netmon:netmon /usr/share/netmon /var/lib/netmon /var/log/netmon

echo ""
echo "============================================"
echo "  Installation complete!"
echo ""
echo "  Config: /etc/netmon/config.env"
echo "  Logs:   /var/log/netmon/"
echo "  Data:   /var/lib/netmon/"
echo "============================================"
