# ClawPet

[English](README.md) | [한국어](README.ko.md)

Desktop pet UI for OpenClaw, built with Tauri + React.

ClawPet sits on top of your desktop, connects to OpenClaw Gateway over WebSocket, and lets you chat with image attachments and screen capture.

## Project Status

- Usable beta
- Cross-platform config discovery implemented (Windows, macOS, Linux)
- Best-tested path today: Windows desktop + OpenClaw local/WSL2

## Features

- Always-on-top transparent character window + tray control
- OpenClaw Gateway handshake (`protocol v3`) and chat streaming
- Image attachment from:
  - drag and drop image files
  - drag and drop browser images/URLs
  - clipboard image paste
- Area capture (drag rectangle) -> immediate image attachment
- Full screen capture (monitor where ClawPet is located) -> immediate attachment
- Persistent local conversation history (ClawPet-only)
- External message queue UX ("new letter" style notifications)
- Identity nameplate from OpenClaw `identity.md`

## Compatibility Matrix

1. OpenClaw local on same machine: supported
2. OpenClaw in WSL2 while ClawPet runs on Windows: supported
3. OpenClaw on remote VPS/LAN: supported over `wss://` (use explicit `OPENCLAW_GATEWAY_URL` and token)

## Runtime Requirements

### End users (running built app)

- OpenClaw Gateway running and reachable
- Valid OpenClaw gateway token

### Developers (building from source)

- Node.js 20+
- pnpm 9+
- Rust stable + Cargo
- Tauri v2 build prerequisites for your OS

## Install and Run

### Option A: Use release binaries (recommended for end users)

- Download from GitHub Releases
- Windows: install `.msi` and run `ClawPet`
- macOS/Linux: if no prebuilt artifact exists for your platform yet, use Option B

### Option B: Build from source

```bash
pnpm install
pnpm tauri dev
```

Production build:

```bash
pnpm build
pnpm tauri build
```

Windows helper scripts:

- `build.bat`
- `build-debug.bat`
- `build.ps1`

## Configuration

ClawPet reads config in this order:

1. Environment variables
2. Explicit path variables
3. Auto-discovered user config files

Connection policy in release build CSP:

- local gateway: `ws://127.0.0.1:*` / `ws://localhost:*`
- remote gateway: `wss://*` only

### Environment variables

- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_GATEWAY_PORT`
- `OPENCLAW_GATEWAY_HOST`
- `OPENCLAW_GATEWAY_URL` (full URL, preferred for remote VPS)
- `OPENCLAW_CONFIG_PATH` (path list allowed)
- `OPENCLAW_WSL_CONFIG_PATH` (path list allowed)
- `OPENCLAW_WORKSPACE_PATH` (path list allowed)
- `OPENCLAW_IDENTITY_PATH` (path list allowed)
- `OPENCLAW_IDENTITY_NAME` (force override display name)

Path list separator:

- Windows: `;`
- macOS/Linux: `:`

### Auto-discovery locations

Config (`openclaw.json`) candidates include:

- `~/.openclaw/openclaw.json`
- `~/.config/openclaw/openclaw.json`
- OS config dir variants (`openclaw`, `OpenClaw`)
- On Windows: scanned `\\wsl$\<distro>\home\<user>\.openclaw\openclaw.json`

Identity (`identity.md` / `IDENTITY.md`) candidates include:

- OpenClaw workspace from config (`agents.defaults.workspace` etc.)
- `~/.openclaw/workspace`
- `~/.openclaw`
- OS config dir variants

## Setup Examples

### 1) Windows + OpenClaw local

Usually zero-config works if OpenClaw uses `%USERPROFILE%\.openclaw\openclaw.json`.

### 2) Windows + OpenClaw in WSL2

Recommended explicit env:

```powershell
$env:OPENCLAW_WSL_CONFIG_PATH="\\wsl$\Ubuntu\home\<you>\.openclaw\openclaw.json"
```

### 3) Remote VPS Gateway

```bash
OPENCLAW_GATEWAY_URL=wss://your-domain-or-ip:18789
OPENCLAW_GATEWAY_TOKEN=...
```

## Feature Toggles

Use `.env` for optional modules:

- `VITE_ENABLE_IMAGE_DROP=true|false`
- `VITE_ENABLE_CLIPBOARD_IMAGE=true|false`
- `VITE_ENABLE_PARCHMENT=true|false`
- `VITE_ENABLE_AREA_CAPTURE=true|false`

## Limits

- ClawPet image input size limit: 10MB
- Screen capture is auto-compressed for chat gateway size constraints
- Non-image file attachments (`csv`, `xlsx`, `doc`, `pdf`, `txt`) are not supported by ClawPet/OpenClaw chat attachment path yet

## Troubleshooting

### No connection

1. Check OpenClaw Gateway is running
2. Verify token is present
3. Verify URL/host/port
4. Prefer explicit `OPENCLAW_GATEWAY_URL` for remote setups

### Area capture seems stuck

1. Update to latest release build
2. Ensure no old capture window is left open
3. Retry drag-release with left mouse button only
4. If issue persists, open an issue with OS, multi-monitor layout, and scaling factor

### Wrong character name

Set one of:

- `OPENCLAW_IDENTITY_NAME`
- `OPENCLAW_IDENTITY_PATH`
- `OPENCLAW_WORKSPACE_PATH`

## Security Notes

- Never commit real gateway tokens
- Prefer `wss://` for remote or untrusted networks
- Keep secrets in environment/user config only

## Contributing

PRs are welcome. Priorities:

1. Stability (capture, reconnect, multi-monitor edge cases)
2. Cross-platform onboarding
3. Optional module boundaries and safer defaults
4. Better release automation and signed binaries

## License

MIT. See `LICENSE`.

