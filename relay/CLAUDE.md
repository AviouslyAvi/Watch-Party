# relay/ — Cloudflare Worker workspace (Layer 2)

One Worker, one Durable Object class (`Room`). Free tier. No persistent storage — room state lives in the DO's in-memory map, dies when everyone disconnects.

## Files

- `worker.ts` — fetch handler. Upgrades `/ws?room=<id>` to a WebSocket and forwards to the matching `Room` DO.
- `room.ts` — the `Room` Durable Object. Holds: `Set<Connection>`, `adminId`, `freeForAll: bool`, `lastState` (for late joiners).
- `wrangler.toml` — Worker + DO binding config.

## Protocol enforcement

The relay is the source of truth for **permissions only**. The sync engine in `shared/` is authoritative for timing/drift. The relay's jobs:

1. First connection in a fresh room → mark as admin.
2. Forward all messages from admin to everyone.
3. Forward viewer messages **only if** `freeForAll == true`. Otherwise drop and send the viewer a `{type: "revert", at, paused}` so they snap their video back.
4. Forward chat regardless of permissions.
5. Heartbeat the `lastState` to new joiners on connect.

## Local dev

```
wrangler dev               # ws://localhost:8787/ws?room=test
wscat -c "ws://localhost:8787/ws?room=test"
```

## Deploy

```
wrangler deploy            # → avious-party-relay.<account>.workers.dev
```

The userscript reads its WS URL from a build-time env var (`WS_URL`), so deploying doesn't require touching client code — just rebuild with the prod URL.

## Rules

- Never log message contents (chat is private). Log only connection events and counts.
- Don't add auth. Room ID + URL fragment is the only secret. If two strangers guess the same UUID, they share a room — that's fine for v1.
- Don't add persistence. The moment we add KV or D1, costs and complexity go up.
