# shared/ — sync engine workspace (Layer 2)

Pure TypeScript. No DOM. No WebSocket. No globals. Everything here is unit-testable in plain Node.

## Files

- `protocol.ts` — message type definitions exchanged over the WebSocket. Single source of truth for both client and relay. If you add a field here, both `client/userscript/main.ts` and `relay/room.ts` need updating.
- `sync.ts` — the sync engine. Takes injected `send`, `onIncoming`, and `getVideo` callbacks. Decides when to emit events, applies remote events, and handles drift correction.

## Pipeline

1. **Local event** → engine decides if it should emit (suppress flag, debounce).
2. **Emit** → calls injected `send(msg)`.
3. **Remote event** → engine applies to video via injected adapter, sets suppress flag for ~250ms so the resulting local event doesn't echo back.
4. **Heartbeat** → admin only, every 5s. Viewers compare `at` against their `currentTime`; if drift > 1.5s, seek.

## Rules

- Inject everything DOM-related. The engine takes a `VideoAdapter` interface (`play()`, `pause()`, `seek(t)`, `getTime()`, `isPaused()`, `onEvent(cb)`). The userscript implements this against the real `<video>`; tests implement it as an in-memory stub.
- All times are floats in seconds (video time) or millisecond unix timestamps (wall clock). Never mix.
- Protocol version field is required. If a future change is incompatible, bump it.
