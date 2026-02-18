#!/bin/bash
# ClawGotchi cron job 설정 스크립트
# 10분마다 혼잣말 트리거 (서버가 실행 중일 때만 동작)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CRON_COMMENT="# clawgotchi-monologue"
CRON_CMD="*/10 * * * * curl -s http://localhost:8787/monologue/trigger > /dev/null 2>&1 $CRON_COMMENT"

# 기존 cron job 제거
crontab -l 2>/dev/null | grep -v "clawgotchi-monologue" > /tmp/crontab_clean 2>/dev/null

# 새 cron job 추가
echo "$CRON_CMD" >> /tmp/crontab_clean
crontab /tmp/crontab_clean
rm -f /tmp/crontab_clean

echo "[clawgotchi] ✅ Cron job 설정 완료 (10분마다 혼잣말 트리거)"
echo "[clawgotchi] 확인: crontab -l | grep clawgotchi"
