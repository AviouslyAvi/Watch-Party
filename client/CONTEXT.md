# client/ — browser-side workspace (Layer 2)

Two delivery vehicles for the same `shared/` engine. v1 = Tampermonkey userscript (shipping). v2 = Chrome MV3 extension (shipping in test, see `docs/HANDOFF.md`).

## Load

### v1: `userscript/`
- `main.ts` — top-frame entry. `@match *://*/*`. Locates `<video>`, mounts the floating panel, opens the WebSocket, wires `shared/sync.ts` to the live `<video>`.
- `iframe-bridge.ts` — runs inside cross-origin player iframes. Hooks the iframe's `<video>`, postMessages events to the top frame, receives commands back.
- `ui/panel.ts` — floating draggable panel: room link, participants, free-for-all toggle (admin), chat.
- `banner.txt` — Tampermonkey `// ==UserScript==` header. `build.mjs` prepends it.

### v2: `extension/`
Dormant-by-default. Toolbar click activates per-tab; no declarative `content_scripts`.
- `manifest.json` — MV3. Background SW + action button + `<all_urls>` host permission. No `content_scripts` block.
- `background.ts` — service worker. Owns per-tab activation in `chrome.storage.session`, programmatic injection via `chrome.scripting.executeScript`, re-injection on `webNavigation.onCommitted`, grace-period teardowns via `chrome.alarms`.
- `content.ts` — runs in iframes (always) and top frames (only when SW injects). `window.__WATCH_PARTY__` sentinel so re-inject after soft teardown remounts the existing instance.

See `extension/README.md` for the full activation table.

## Skip

`../node_modules/`, `../dist/`, `../shared/` (only import from it via the engine API).

## Pipeline rules

1. **Never** reach into `shared/` and add a DOM dep. Wrap it in the client adapter instead.
2. Video detection is fragile. Use a `MutationObserver` on `document` (top) and on the iframe's `document` to catch source-switch / episode-change remounts.
3. Two video adapters exist (top-frame and iframe-bridge). They share the same `VideoAdapter` interface from `shared/`.
4. No raw relay URLs in source. Read `WS_URL` from build env. See `../build.mjs`.

## Known v1 fixes already landed (don't regress)

- Capture room link at **click time**, not at boot — SPA paths (Cineby etc.) change after load.
- Chat input swallows keyboard shortcuts (spacebar, arrows) so they don't leak to the page's player.
- Drift-check before seek on remote play/pause — prevents needless buffering spinner.

## Build / release

```bash
node build.mjs                                  # default target
TARGET=user node build.mjs                      # → dist/avious-party.user.js
TARGET=ext node build.mjs                       # → dist/extension/
WS_URL=wss://... TARGET=ext node build.mjs      # prod extension build
```

Userscript releases: paste `dist/avious-party.user.js` into Tampermonkey's editor, or host the raw `.user.js` on GitHub — Tampermonkey auto-installs from raw URLs.
Extension releases: zip `dist/extension/`, share for "Load unpacked".

## Skills/MCP

- `playwright` — for debugging real-page video detection across stream providers.
