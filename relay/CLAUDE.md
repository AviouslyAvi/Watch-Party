# relay/ — Cloudflare Worker workspace (Layer 2)

One Worker, one Durable Object class (`Room`). Free tier. No persistent storage — room state lives in the DO's in-memory map, dies when everyone disconnects.

## Files

- `worker.ts` — fetch handler. Upgrades `/ws?room=<id>` to a WebSocket and forwards to the matching `Room` DO.
- `room.ts` — the `Room` Durable Object. Holds: `Set<Connection>`, `adminId`, `freeForAll: bool`, `lastState` (for late joiners), `passphrase` (optional OOB secret, pinned by the first joiner).
- `wrangler.toml` — Worker + DO binding config.

## Protocol enforcement

The relay is the source of truth for **permissions only**. The sync engine in `shared/` is authoritative for timing/drift. The relay's jobs:

1. First connection in a fresh room → mark as admin.
2. Forward all messages from admin to everyone.
3. Forward viewer messages **only if** `freeForAll == true`. Otherwise drop and send the viewer a `{type: "revert", at, paused}` so they snap their video back.
4. Forward chat regardless of permissions.
5. Heartbeat the `lastState` to new joiners on connect.
6. **Passphrase gate.** If a joiner's `hello.passphrase` doesn't match the room's pinned passphrase, send `{type: "rejected", reason: "passphrase"}` and close. The first joiner to a fresh room sets the passphrase (null if they didn't send one). Passphrase is pinned in DO memory only — when the room empties and the DO is evicted, the next first-joiner re-pins.

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
- The room ID is ~128 bits of entropy (base64url, generated client-side in `ensureRoom()`). Scanning is infeasible. An optional out-of-band passphrase can be added by including `&key=<value>` in the share URL — defends against the URL leaking into a group chat where someone unwanted lurks.
- Don't add real auth (accounts, tokens). Room ID + optional passphrase are the only secrets, both carried in the URL fragment so nothing identifying ever hits the server.
- Don't add persistence. The moment we add KV or D1, costs and complexity go up.
