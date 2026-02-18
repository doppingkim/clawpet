#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_CFG="$OPENCLAW_DIR/openclaw.json"
CANDIDATE="${1:-}"

remove_cron() {
  if [[ -x "$PROJECT_DIR/scripts/remove-cron.sh" ]]; then
    bash "$PROJECT_DIR/scripts/remove-cron.sh"
  else
    crontab -l 2>/dev/null | grep -v "clawgotchi-monologue" > /tmp/crontab_clean 2>/dev/null || true
    crontab /tmp/crontab_clean 2>/dev/null || true
    rm -f /tmp/crontab_clean
    echo "[clawgotchi] cron job removed"
  fi
}

pick_backup() {
  if [[ -n "$CANDIDATE" ]]; then
    echo "$CANDIDATE"
    return 0
  fi

  if [[ -f "$OPENCLAW_DIR/openclaw.json.clawgotchi.bak" ]]; then
    echo "$OPENCLAW_DIR/openclaw.json.clawgotchi.bak"
    return 0
  fi

  if [[ -f "$OPENCLAW_DIR/openclaw.json.bak" ]]; then
    echo "$OPENCLAW_DIR/openclaw.json.bak"
    return 0
  fi

  local latest
  latest=$(ls -1t "$OPENCLAW_DIR"/openclaw.json.bak.* 2>/dev/null | head -n 1 || true)
  if [[ -n "$latest" ]]; then
    echo "$latest"
    return 0
  fi

  echo ""
}

restore_openclaw_config() {
  local backup
  backup=$(pick_backup)

  if [[ -z "$backup" || ! -f "$backup" ]]; then
    echo "[clawgotchi] WARN: no backup found."
    echo "[clawgotchi] restore manually: cp ~/.openclaw/openclaw.json.bak ~/.openclaw/openclaw.json"
    return 0
  fi

  mkdir -p "$OPENCLAW_DIR"

  if [[ -f "$OPENCLAW_CFG" ]]; then
    local stamp
    stamp=$(date +%Y%m%d%H%M%S)
    local current_backup="$OPENCLAW_CFG.before-clawgotchi-uninstall.$stamp.bak"
    cp "$OPENCLAW_CFG" "$current_backup"
    echo "[clawgotchi] current config backup: $current_backup"
  fi

  cp "$backup" "$OPENCLAW_CFG"
  echo "[clawgotchi] restored openclaw config from: $backup"
}

remove_cron
restore_openclaw_config

echo "[clawgotchi] done: cron removed + openclaw.json restore attempted"
