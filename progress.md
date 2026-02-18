Original prompt: ªÁøÎ¿⁄ ªÁøÎ ø©¡§(UX) ∞¸¡°ø°º≠ »Â∏ß¿ª ∞À≈‰«ÿ¡‡. æÓªˆ«— ∫Œ∫–¿Ã æ¯¥¬¡ˆ, ∏≈≤Ù∑¥¡ˆ ∏¯«— ∫Œ∫–¿∫ æ¯¥¬¡ˆ ∞À≈‰«ÿ¡÷¥¬ QA plan¿ª ººøÏ∞Ì ¬˜∑ ¬˜∑  test∏¶ Ω«Ω√«ÿ¡‡.

## 2026-02-18 QA kickoff
- Applied skill: develop-web-game
- Goal: Create UX user-journey QA plan and execute tests step-by-step with evidence.
- Initial context gathered: README, existing `scripts/qa_20.mjs`, and prior `QA_CHECKLIST_20.md`.

## TODO
- Confirm dev servers (web/api) are reachable.
- Build a user-journey QA plan with explicit scenarios.
- Execute each scenario in order and capture findings (pass/fail + UX friction).
- Summarize awkward/non-smooth points and improvement suggestions.

## 2026-02-18 User-journey QA execution log
- Test env: web `http://localhost:5173`, api `http://localhost:8787` (both 200)
- Existing script `scripts/qa_20.mjs` failed due hardcoded Chromium path (`/usr/bin/chromium-browser` ENOENT).
- Switched to MCP Playwright for step-by-step UX journey validation.

### Scenario results
1) Entry/Onboarding
- PASS: room canvas, 3 gauges, 3 action buttons, sound/chat controls visible on desktop.

2) Feedback clarity (gauge tooltip)
- PASS: hover and tap both show tooltip with percentage.

3) Core interaction loop (feed/pet)
- PASS: feed limit message appears on 3rd attempt; pet limit message appears on 4th attempt.

4) Chat flow
- PASS: chat input opens, maxlength=100 enforced, Enter submits, chat box closes.
- OBS: bubble shows "ª˝∞¢¡ﬂ¿Ãø°ø‰..." before task/event text appears.

5) Event integration flow (`POST /emit`)
- PASS: API 200 and bubble reflects summary text (`UX QA flow check`).

6) Direct pet click reaction
- PASS: click on pet changes reaction bubble.

7) Mobile responsiveness (390x844)
- FAIL (UX): canvas width 506 > viewport 390, horizontal scroll appears; top-right controls are outside viewport.

8) Console/runtime friction
- WARN: repeated AudioContext autoplay warnings before user gesture.
- WARN: favicon.ico 404 error.
- OBS: frequent ws connect/disconnect logs in some runs (possible noisy runtime state).

## Suggested follow-ups
- Make room canvas scale responsively on narrow viewport to avoid horizontal scrolling.
- Keep top controls anchored inside viewport on mobile.
- Initialize/resume audio context only after first user gesture to remove warning noise.
- Add favicon asset or route fallback to remove 404.

## Completion
- User-journey QA plan created and executed sequentially.
- Primary UX issue identified: mobile viewport overflow/clipping.
- Detailed findings delivered to user.

## 2026-02-18 UX fix implementation
- Executed per-step fix plan for previously found UX frictions.

### Changes applied
- `apps/web/src/App.tsx`
  - Removed fixed inline room size from JSX to allow CSS-driven responsive sizing.
  - Added `audioReady` gating and first-gesture unlock effect for WebAudio.
  - Updated SFX/BGM guards to avoid creating/playing audio before user gesture.
  - Updated BGM effect dependencies to include `audioReady`.
- `apps/web/src/styles/app.css`
  - Set default `.roomShell` size to `512x512` in CSS.
  - Added mobile sizing rule using viewport min constraints (`100vw`/`100dvh`) and reduced root padding.
- `apps/web/index.html`
  - Added favicon link to prevent `/favicon.ico` 404.
- `scripts/qa_20.mjs`
  - Replaced hardcoded Chromium executable usage with conditional launch option.
  - Updated chat length check to 100 chars.
  - Hardened checks 5/9/10/12/13/15/16 to be behavior-based and resilient to text variation.
  - Normalized PASS/FAIL output labels.

### Verification
- Build: `npm --workspace @clawgotchi/web run build` (PASS)
- Manual Playwright checks (desktop + mobile)
  - Mobile 390x844: canvas/action/top controls all inside viewport (PASS)
  - Console warnings/errors: AudioContext warning ÏóÜÏùå, favicon 404 ÏóÜÏùå
- Automated QA: `node scripts/qa_20.mjs` (20/20 PASS)

### Residual note
- `App.tsx` currently contains an existing `TEST` button in actions (pre-existing working-tree change).

## 2026-02-18 Public release readiness check (OpenClaw-required policy)

### Checklist audit result
- OpenClaw missing env should fail-fast: FAIL
  - Evidence: `apps/server/src/index.ts` logs "no openclaw.json, skipping WS listener" and continues startup.
- OpenClaw-connected env basic relay check: PASS (current machine)
  - Evidence: `/debug/gateway` returned `connected=true`, `wsState=1`.
- README reproducibility for mandatory integration: PASS (rewritten)
  - `README.md` replaced with strict OpenClaw-required setup and verification flow.
- Hardcoded personal paths / machine-specific assumptions: FAIL
  - Evidence: multiple scripts still contain `/home/dopping/...` and global playwright path.
- Debug/test-only controls removed from user UI: FAIL
  - Evidence: `startTestPatrol()` TEST button still present in `App.tsx`.

### Action note
- This turn focused on audit + README rewrite per user request.
- Remaining code-level hardening (fail-fast enforcement, path/env generalization, debug UI removal) is still required before public release.
