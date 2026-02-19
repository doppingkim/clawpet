# ClawGotchi

A desktop pet UI for OpenClaw, built with Tauri + React.

ClawGotchi stays on top of your desktop, connects to an OpenClaw Gateway over WebSocket, and lets you chat (including image attachments) through a compact character-driven UI.

## Current features

- Always-on-top transparent pet window with tray controls
- Gateway handshake (`protocol v3`, `connect`) + chat streaming (`chat` events)
- Image input from:
  - file drag & drop
  - browser image drag & drop (URL/HTML/file)
  - clipboard paste
- Right-click radial action menu on character (capture + dummy actions)
- Rectangle area capture -> immediate chat attachment
- 10MB image input limit in ClawGotchi
- Speech bubble + optional parchment window for long responses

## Tech stack

- Frontend: React + TypeScript + Zustand + Vite
- Desktop shell: Tauri v2 (Rust backend + system tray)
- Gateway: OpenClaw WebSocket protocol

## Quick start (development)

1. Install prerequisites

- Node.js 20+
- pnpm 9+
- Rust toolchain + Cargo
- Tauri prerequisites for your OS

2. Run OpenClaw Gateway first

- Ensure OpenClaw is running and Gateway is reachable.
- Default local URL is `ws://127.0.0.1:18789`.

3. Install and run ClawGotchi

```bash
pnpm install
pnpm tauri dev
```

## Configuration (no hard-coded secrets)

ClawGotchi reads connection settings in this order:

1. Environment variables
2. Explicit config path env vars
3. User config files (Windows + WSL discovery)

### Environment variables

- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_GATEWAY_PORT`
- `OPENCLAW_GATEWAY_HOST`
- `OPENCLAW_GATEWAY_URL` (full URL override; e.g. `ws://host:port` or `wss://...`)
- `OPENCLAW_CONFIG_PATH` (explicit `openclaw.json` path)
- `OPENCLAW_WSL_CONFIG_PATH` (explicit WSL `openclaw.json` path)

### Auto-discovery paths

- `%USERPROFILE%\.openclaw\openclaw.json`
- `\\wsl$\<distro>\home\<user>\.openclaw\openclaw.json` (scanned automatically)

Example WSL path:

- `\\wsl$\Ubuntu\home\dopping\.openclaw\openclaw.json`

## Feature toggles (modular on/off)

Use `.env` or process env during dev/build:

- `VITE_ENABLE_IMAGE_DROP=true|false`
- `VITE_ENABLE_CLIPBOARD_IMAGE=true|false`
- `VITE_ENABLE_PARCHMENT=true|false`
- `VITE_ENABLE_AREA_CAPTURE=true|false`

This keeps features modular so users can disable unwanted behavior without code edits.

## Image input behavior

- Supported image types: `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`
- ClawGotchi input limit: 10MB
- If your OpenClaw Gateway still enforces 5MB, increase Gateway attachment limits as well.

## Area capture flow

1. Right-click the character.
2. Click the crop action button (`✂️`) in the radial menu.
3. Drag a rectangle on screen.
4. On mouse-up, capture is attached immediately and chat input opens.

## Cross-platform setup notes

### Windows + OpenClaw on Windows

- Usually works with `%USERPROFILE%\.openclaw\openclaw.json`.

### Windows + OpenClaw in WSL2

- Auto-discovery checks `\\wsl$...` paths.
- For deterministic behavior, set `OPENCLAW_WSL_CONFIG_PATH`.

### macOS/Linux + OpenClaw local

- Use local `.openclaw/openclaw.json` in your home directory, or set `OPENCLAW_CONFIG_PATH`.

### Remote Gateway (LAN/VPS)

- Set `OPENCLAW_GATEWAY_URL` and token env vars.
- Prefer `wss://` for untrusted networks.

## Build and package

```bash
pnpm build
pnpm tauri build
```

Windows helper scripts:

- `build.bat`
- `build-debug.bat`
- `build.ps1`

## Open-source onboarding and release checklist

Before publishing releases:

1. Keep secrets outside repo (env/user config only)
2. Test on at least:
- Windows + local OpenClaw
- Windows + WSL OpenClaw
- macOS/Linux local OpenClaw (if supported)
3. Verify tray behavior, reconnect flow, image drop, and chat streaming
4. Document known limits and required OpenClaw version
5. Sign binaries and provide checksums where possible
6. Keep migration-safe config paths (`OPENCLAW_CONFIG_PATH` support)

## Contributing

Contributions are welcome. Focus areas:

- Stability (disconnect/reconnect and event handling)
- Cross-platform path and networking compatibility
- Optional feature modules and safer defaults
- Better onboarding docs and installer UX
