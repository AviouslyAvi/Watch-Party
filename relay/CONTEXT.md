# relay/ — Cloudflare Worker workspace (Layer 2)

One Worker, one Durable Object class (`Room`). Free tier. No persistent storage — room state lives in the DO's in-memory map and dies when everyone disconnects.

## Load

- `worker.ts` — fetch handler. Upgrades `/ws?room=<id>` to a WebSocket and forwards to the matching `Room` DO.
- `room.ts` — the `Room` Durable Object. Holds `Set<Connection>`, `adminId`, `freeForAll: bool`, `lastState` (for late joiners).
- `wrangler.toml` — Worker + DO binding config.

## Skip

`../node_modules/`, `.wrangler/` (local state).

## Protocol enforcement

The relay is the source of truth for **permissions only**. `shared/sync.ts` is authoritative for timing and drift. The relay's jobs:

1. First connection in a fresh room → mark as admin.
2. Forward all messages from admin to everyone.
3. Forward viewer messages **only if** `freeForAll == true`. Otherwise drop and send the viewer `{ type: "revert", at, paused }` so they snap their video back.
4. Forward chat regardless of permission.
5. Send `lastState` to new joiners on connect.

## Pipeline (one connection)

1. Browser opens `wss://.../ws?room=<id>`.
2. Worker hashes `<id>` → DO instance → `fetch(upgrade)` to the DO.
3. DO accepts the socket, decides admin vs viewer, replays `lastState`, joins the broadcast set.
4. On every inbound message: permission gate → fan out to other connections → update `lastState` if it's a state-bearing message.

## Local dev

```bash
wrangler dev                               # ws://localhost:8787/ws?room=test
wscat -c "ws://localhost:8787/ws?room=test"
```

## Deploy

```bash
wrangler login                             # one-time, per machine
wrangler deploy                            # → avious-party-relay.<account>.workers.dev
```

The client reads its WS URL from a build-time `WS_URL` env var, so deploying never requires touching client code — just rebuild.

## Rules

- Never log message contents (chat is private). Log only connection events + counts.
- Don't add auth. Room ID + URL fragment is the only secret. Two strangers guessing the same UUID share a room — fine for v1.
- Don't add persistence (KV / D1). Costs and complexity blow up the moment we do.

## Skills/MCP

None required.
