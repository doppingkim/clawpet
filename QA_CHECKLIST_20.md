<p align="right">
  <a href="./QA_CHECKLIST_20.md">English</a> | <a href="./QA_CHECKLIST_20.ko.md">한국어</a>
</p>

# QA Checklist

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Web server up | PASS | http://localhost:5173 |
| 2 | API server up | PASS | http://localhost:8787/health |
| 3 | Room canvas renders | PASS | 512x512 pixel room |
| 4 | Gauge count = 3 (satiety, affection, energy) | PASS | |
| 5 | Action buttons = 3 (feed, pet, chat) | PASS | |
| 6 | Gauge tooltip visible (not clipped) | PASS | |
| 7 | Gauge tooltip shows percentage | PASS | |
| 8 | Tap tooltip works on mobile | PASS | |
| 9 | Feed limit after 2 (per 10 min) | PASS | |
| 10 | Pet limit after 3 (per 10 min) | PASS | |
| 11 | POST /emit accepted | PASS | |
| 12 | Task bubble single line | PASS | |
| 13 | Click pet → reaction bubble | PASS | |
| 14 | Idle FSM defined (17 steps) | PASS | |
| 15 | Idle includes watering + shelf-cleaning + bed rolling | PASS | |
| 16 | Idle routine keywords defined | PASS | |
| 17 | Room loads after custom image swap | PASS | |
| 18 | Press Start 2P font applied | PASS | |
| 19 | Bubble viewport safe (or hidden) | PASS | |
| 20 | Chat input opens + 100 char max | PASS | |
