#!/bin/bash
# ClawGotchi cron job 제거 스크립트

crontab -l 2>/dev/null | grep -v "clawgotchi-monologue" > /tmp/crontab_clean 2>/dev/null
crontab /tmp/crontab_clean
rm -f /tmp/crontab_clean

echo "[clawgotchi] ❌ Cron job 제거 완료"
