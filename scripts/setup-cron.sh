#!/bin/bash
# ClawGotchi cron job setup script
# Triggers monologue every 10 minutes (effective only while server is up)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_CFG="$OPENCLAW_DIR/openclaw.json"
CLAWGOTCHI_BACKUP="$OPENCLAW_DIR/openclaw.json.clawgotchi.bak"
CRON_COMMENT="# clawgotchi-monologue"
CRON_CMD="*/10 * * * * curl -s http://localhost:8787/monologue/trigger > /dev/null 2>&1 $CRON_COMMENT"

# Save one-time backup for uninstall restore flow.
if [[ -f "$OPENCLAW_CFG" && ! -f "$CLAWGOTCHI_BACKUP" ]]; then
  cp "$OPENCLAW_CFG" "$CLAWGOTCHI_BACKUP"
  echo "[clawgotchi] openclaw config backup created: $CLAWGOTCHI_BACKUP"
fi

# Remove existing ClawGotchi cron line.
crontab -l 2>/dev/null | grep -v "clawgotchi-monologue" > /tmp/crontab_clean 2>/dev/null || true

# Add fresh cron line.
echo "$CRON_CMD" >> /tmp/crontab_clean
crontab /tmp/crontab_clean
rm -f /tmp/crontab_clean

echo "[clawgotchi] cron job configured (every 10 min)"
echo "[clawgotchi] verify: crontab -l | grep clawgotchi"
