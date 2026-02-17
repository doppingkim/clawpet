# ClawGotchi

A tamagotchi-style virtual pet that lives inside a cozy pixel-art room and reacts to your [OpenClaw](https://github.com/anthropics/openclaw) agent's work in real time.

Feed it, pet it, chat with it — or just watch it go about its little daily routine while your AI agent handles tasks in the background.

## Features

**Pet Interaction**
- Feed (`🍙`), pet (`🤲`), or chat (`/`) with your pet
- Mood-based speech bubbles that change with hunger, affection, and energy
- Click the pet for surprise reactions, toggle room lights via the window

**Live Agent Integration**
- Connects to OpenClaw Gateway via WebSocket to receive agent events in real time
- Auto-categorizes tasks (coding, shopping, writing, research, and 8 more built-in categories)
- Pet walks to the relevant furniture and shows context-aware status messages

**Idle Routine**
- When idle, the pet reads books, waters plants, dusts shelves, rolls lint off the bed, checks the calendar, and naps
- Sleeping animation with blanket and floating Zzz

**Room Growth**
- Task history is tracked over 30 days
- When a category dominates your recent work (e.g., 40%+ coding), the room upgrades (dual monitors → triple screen setup)
- 5 upgrade paths: coding, shopping, writing, research, calendar

**Audio**
- Procedural SFX for each action (typing, watering, page flip, walking, feeding, petting, sleeping, pop)
- Chiptune BGM loop
- Mute toggle in the top-right corner

## Architecture

```
clawgotchi/
├── apps/
│   ├── server/          # Express + WebSocket server (port 8787)
│   │   ├── index.ts           # REST API + WS broadcast
│   │   ├── categories.ts      # Dynamic category registry (12 built-in + custom)
│   │   ├── gateway-listener.ts # OpenClaw Gateway WS client
│   │   └── room-growth.ts     # Task-history-based room upgrades
│   └── web/             # React + Canvas frontend (port 5173)
│       ├── components/PetRoom.tsx    # Canvas renderer (room, character, items, effects)
│       ├── hooks/useTaskEvents.ts    # WS event listener
│       ├── store/usePetStore.ts      # Zustand state (movement, idle FSM, gauges)
│       └── store/bubbleTemplates.ts  # Mood × category speech bubble system
├── packages/shared/     # Shared TypeScript types
├── bin/clawgotchi.mjs   # CLI launcher (opens browser window)
├── scripts/             # Asset generation scripts (pngjs-based pixel art)
└── data/                # Runtime data (categories, task history, room upgrades)
```

## Requirements

- Node.js 20+
- npm
- OpenClaw Gateway running (optional — for live agent event relay)

## Getting Started

```bash
git clone https://github.com/anthropics/clawgotchi.git
cd clawgotchi
npm install
npm run dev
```

Once running:
- **Web UI**: http://localhost:5173
- **API Server**: http://localhost:8787

Quick health check:
```bash
curl http://localhost:8787/health
```

## OpenClaw Gateway Integration

ClawGotchi connects to your local OpenClaw Gateway to receive real-time agent events.

Configuration is read from `~/.openclaw/openclaw.json`:
```json
{
  "gateway": {
    "port": 18789,
    "auth": { "token": "your-token" }
  }
}
```

When connected, the pet automatically reacts to your agent's work — walking to the laptop when coding, checking the calendar for scheduling tasks, etc.

If Gateway is not available, you can still use the `/emit` API to send events manually.

## API

### `GET /health`
Server status check.

### `GET /profile`
Returns the assistant name (read from `openclaw.json` or `IDENTITY.md`).

### `GET /categories`
Returns all registered task categories (built-in + dynamic).

### `GET /upgrades`
Returns current room upgrade status.

### `POST /emit`
Inject a task event. The server auto-categorizes the summary if no category is provided.
```bash
curl -X POST http://localhost:8787/emit \
  -H 'content-type: application/json' \
  -d '{"category":"coding","status":"working","summary":"Refactoring auth module"}'
```

### `POST /chat`
Chat with the pet (max 100 characters). If OpenClaw Gateway is connected, the message is relayed to the main agent session.
```bash
curl -X POST http://localhost:8787/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Hello!"}'
```

### `WS /events`
WebSocket endpoint for real-time task event streaming to the frontend.

## Built-in Categories

| Category | Label | Furniture Target |
|----------|-------|-----------------|
| coding | Coding | Laptop |
| shopping | Shopping | Basket |
| calendar | Calendar | Calendar |
| writing | Writing | Bookshelf |
| research | Research | Desk |
| music | Music | Guitar |
| communication | Communication | Laptop |
| gaming | Gaming | Gamepad |
| art | Art/Design | Canvas |
| cooking | Cooking | Stove |
| finance | Finance | Laptop |
| learning | Learning | Notebook |

## Room Upgrade Thresholds (7-day window)

| Category | Level 1 | Level 2 |
|----------|---------|---------|
| coding | 40% → Dual monitors | 80% → Triple screen |
| shopping | 25% → Large cart | 50% → Delivery boxes |
| writing | 30% → Typewriter | 60% → Extended bookshelf |
| research | 30% → Magnifier | 60% → Research board |
| calendar | 30% → Digital calendar | 60% → Planner desk |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_EVENTS` | `0` | Set to `1` to enable mock event broadcasting for testing |
| `GEMINI_API_KEY` | — | Gemini API key (for asset generation scripts) |
| `CLAWGOTCHI_URL` | `http://localhost:5173` | URL for the CLI launcher |

## Scripts

```bash
npm run dev          # Start both web and server in parallel
npm run open         # Open ClawGotchi in a browser window
node scripts/qa_20.mjs           # Run QA checklist
node scripts/generate_assets.mjs # Generate base pixel art assets
node scripts/generate_cozy_pack.mjs # Generate cozy-style asset pack
```

## Troubleshooting

### "Site can't be reached"
Dev server not running or port conflict:
```bash
lsof -ti tcp:5173 | xargs -r kill
lsof -ti tcp:8787 | xargs -r kill
npm run dev
```

### Events/chat not working
Check server health at `http://localhost:8787/health` and review the dev console output.

### Gateway relay not connecting
- Verify `~/.openclaw/openclaw.json` has a valid `gateway.auth.token`
- Ensure Gateway allows `sessions_send` via HTTP tools/invoke
- Check server logs for `[gateway-ws]` messages

## License

MIT
