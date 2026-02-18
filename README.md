<p align="right">
  <a href="./README.md">English</a> | <a href="./README.ko.md">한국어</a>
</p>

# ClawGotchi

ClawGotchi is a virtual pet UI for **live OpenClaw activity**.

## Non-Negotiable Requirement

ClawGotchi is designed to run **only with OpenClaw Gateway integration**.

- If OpenClaw Gateway is not configured, this project is considered misconfigured.
- This repository does not define a standalone mode.

## What You Need

- Node.js 20+
- npm
- A running OpenClaw setup with Gateway enabled
- Access to `~/.openclaw/openclaw.json`
- No `.env` file is required

## 1) Configure OpenClaw Gateway (Required)

Edit `~/.openclaw/openclaw.json` and make sure Gateway fields are present.

```json
{
  "identity": {
    "name": "YourAssistantName"
  },
  "gateway": {
    "port": 18789,
    "auth": {
      "token": "your-token"
    }
  }
}
```

Required keys:

- `gateway.port`
- `gateway.auth.token`

Notes:

- Keep your real token private.
- Never commit personal `openclaw.json` to Git.

## 2) Install and Run ClawGotchi

```bash
git clone https://github.com/doppingkim/ClawGotchi.git
cd ClawGotchi
npm install
npm run dev
```

Default endpoints:

- Web UI: `http://localhost:5173`
- API Server: `http://localhost:8787`

## 3) Verify Gateway Connection

Check ClawGotchi server health:

```bash
curl http://localhost:8787/health
```

Check Gateway relay state:

```bash
curl http://localhost:8787/debug/gateway
```

Expected for healthy integration:

- `connected: true`
- `wsState: 1`

If not connected, see troubleshooting below.

## Runtime Behavior

When integration is healthy, ClawGotchi will:

- Subscribe to OpenClaw agent events through Gateway WebSocket
- Classify incoming work context by category
- Move the pet to context-specific objects and display matching speech/status
- Relay chat messages to the OpenClaw session (`agent:main:main`)

## API (Operational)

- `GET /health`: server health check
- `GET /profile`: assistant name (from OpenClaw identity fallback chain)
- `GET /categories`: active category registry
- `GET /debug/gateway`: Gateway connection status
- `POST /chat`: relay a message to the OpenClaw session
- `WS /events`: realtime event stream to frontend

## Troubleshooting

### `connected` is `false` on `/debug/gateway`

1. Confirm OpenClaw Gateway is running.
2. Re-check `~/.openclaw/openclaw.json`:
   - `gateway.port` matches your actual Gateway port
   - `gateway.auth.token` is valid
3. Ensure Gateway allows the required invoke flow for session relay.
4. Check server logs for `[gateway-ws]` messages.

### Chat relay fails

1. Confirm token is valid and not expired.
2. Confirm Gateway invoke endpoint is reachable on configured port.
3. Confirm target OpenClaw session key is available (`agent:main:main`).

### Port conflict

If `8787` or `5173` is already used, free the port and restart.

## Security

- Treat `gateway.auth.token` as a secret.
- Do not commit local credentials, logs with secrets, or personal OpenClaw config files.

## Uninstall (Cleanup)

Run one command to remove the 10-minute monologue cron and restore your OpenClaw config:

```bash
npm run uninstall-clawgotchi
```

Restore priority used by the script:

- `~/.openclaw/openclaw.json.clawgotchi.bak`
- `~/.openclaw/openclaw.json.bak`
- newest `~/.openclaw/openclaw.json.bak.*`

It also saves your current config as `openclaw.json.before-clawgotchi-uninstall.TIMESTAMP.bak`.

After uninstall, you can delete the project folder:

```bash
cd ..
rm -rf clawgotchi
```

## License

MIT
