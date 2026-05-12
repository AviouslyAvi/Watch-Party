# shared/ — sync engine (Layer 2)

Pure TypeScript. **No DOM. No WebSocket. No globals.** Everything here is unit-testable in plain Node.

## Load

- `protocol.ts` — message type definitions exchanged over the WebSocket. Single source of truth for client and relay. Adding a field here means updating both `client/userscript/main.ts` (or `client/extension/content.ts`) and `relay/room.ts`.
- `sync.ts` — the engine. Takes injected `send`, `onIncoming`, and a `VideoAdapter`. Decides when to emit, applies remote events, handles drift correction.

## Skip

`../node_modules/`, every other workspace.

## Pipeline

1. **Local event** → engine checks suppress flag + debounce → decides whether to emit.
2. **Emit** → calls injected `send(msg)`.
3. **Remote event** → engine applies to video via adapter, sets suppress flag (~250 ms) so the resulting local event doesn't echo.
4. **Heartbeat** → admin only, every 5 s. Viewers compare `at` against `currentTime`; if drift > 1.5 s, seek.
5. **Drift-check before seek** on `play` / `pause` — only seek if we're actually out of sync. (This kills the buffering-spinner regression.)

## Rules

- Inject everything DOM-related. Engine takes a `VideoAdapter`: `play()`, `pause()`, `seek(t)`, `getTime()`, `isPaused()`, `onEvent(cb)`. Userscript and extension each implement it against the real `<video>`; tests use an in-memory stub.
- All times are floats in seconds (video time) OR millisecond unix timestamps (wall clock). Never mix.
- Protocol version field is required. Bump it on incompatible changes.

## Skills/MCP

None required.
