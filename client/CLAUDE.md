# client/ — browser-side workspace (Layer 2)

Two pipeline stages. v1 ships the userscript. v2 wraps the same `shared/` engine in a Chrome MV3 extension.

## Stages

### Stage 1: `userscript/` (v1, shipping)
- `main.ts` — top-frame entry. Runs on any page (`@match *://*/*`). Locates `<video>`, mounts the floating panel, opens the WebSocket, wires `shared/sync.ts` to the live `<video>`.
- `iframe-bridge.ts` — runs inside cross-origin player iframes. Hooks the `<video>` there, forwards events to the top frame via `postMessage`. Receives commands the other direction.
- `ui/panel.ts` — floating draggable panel: room link, participants, free-for-all toggle (admin), chat.
- `banner.txt` — Tampermonkey `// ==UserScript==` header. `build.mjs` prepends this to the bundled JS.

The userscript must run in **both frames** (top frame on the host page, iframe on whatever stream provider the page loads). The Tampermonkey banner uses `@match *://*/*` plus a runtime check, because we can't predict the iframe origin ahead of time. `iframe-bridge.ts` decides what mode it's in by checking `window === top`.

### Stage 2: `extension/` (v2, empty)
MV3 Chrome extension wrapping the same `shared/` engine. Reasons to upgrade from the userscript:
- Service worker keeps WS alive across SPA route changes (next episode).
- Polished install flow.
- Possible Web Store listing.

## Pipeline rules

1. **Never reach into `shared/` and add a DOM dep.** Add it here in the client wrapper instead.
2. **Video detection is fragile.** Use a `MutationObserver` on `document` (top frame) and the iframe's `document` to catch when the host page remounts the player (source switch, episode change).
3. **Two video adapters exist**: top-frame and iframe-bridge. They share the `VideoAdapter` interface from `shared/`.
4. **No raw URLs in source.** Read `WS_URL` from build-time env (see `build.mjs`).

## Build

```
node build.mjs           # → dist/avious-party.user.js
WS_URL=wss://avious-party-relay.<your>.workers.dev node build.mjs   # prod
```

## Releasing

After build, paste the contents of `dist/avious-party.user.js` into Tampermonkey's editor, or host it raw on GitHub and share the raw URL — Tampermonkey auto-installs from raw URLs ending in `.user.js`.
