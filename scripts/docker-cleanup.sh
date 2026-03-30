#!/bin/bash
# Docker cleanup script for EC2 instances
# Install: sudo cp scripts/docker-cleanup.sh /etc/cron.daily/docker-cleanup && sudo chmod +x /etc/cron.daily/docker-cleanup
# Or add to crontab: 0 3 * * * /opt/papra/scripts/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1

set -euo pipefail

echo "=== Docker Cleanup — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# Remove stopped containers older than 24h
echo "Removing stopped containers..."
docker container prune -f --filter "until=24h" 2>/dev/null || true

# Remove dangling images
echo "Removing dangling images..."
docker image prune -f 2>/dev/null || true

# Remove images not used by any container, older than 72h (keep recent for rollback)
echo "Removing unused images older than 72h..."
docker image prune -a -f --filter "until=72h" 2>/dev/null || true

# Remove unused volumes (careful: only dangling)
echo "Removing dangling volumes..."
docker volume prune -f 2>/dev/null || true

# Remove unused build cache older than 7 days
echo "Removing old build cache..."
docker builder prune -f --filter "until=168h" 2>/dev/null || true

# Report current disk usage
echo ""
echo "Current Docker disk usage:"
docker system df 2>/dev/null || true

echo ""
echo "=== Cleanup complete ==="
