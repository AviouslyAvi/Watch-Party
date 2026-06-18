# v2: MV3 extension (Chrome + Firefox/Zen)

Dormant-by-default. Clicking the toolbar icon turns it on for the current tab; clicking again turns it off. No allowlist of "supported sites" — the user decides per tab.

Source is shared across Chrome and Firefox/Zen — only the manifest and a one-line
namespace shim differ. See the **Firefox/Zen** section below.

## Files

- `manifest.json` — MV3. No `content_scripts`. Declares a background service worker, the action button, and `<all_urls>` host permission so the SW can programmatically inject on click.
- `background.ts` — service worker. Owns per-tab activation state in `chrome.storage.session`, handles toolbar clicks, programmatic injection via `chrome.scripting.executeScript`, re-injection on same-origin reload/nav via `chrome.webNavigation.onCommitted`, and grace-period teardowns via `chrome.alarms` (never `setTimeout` — SW unloads).
- `content.ts` — runs in iframes (always) and in top frames (only when SW injects). Top-frame instance is single-shot: a `window.__WATCH_PARTY__` sentinel makes a re-inject after soft teardown remount the UI on the existing instance instead of double-booting.
- `icons/` — toolbar/store icon source (`icon.svg`) + generated PNGs. See **Icons** below.

## Activation model

| Event                                | Result                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Page load (no activation yet)        | Silent. Nothing injected.                                                    |
| User clicks toolbar icon             | SW records `{ origin, activatedAt }` for tabId, injects content.js, "ON" badge. |
| Reload / same-origin SPA nav         | SW re-injects (state survives in `chrome.storage.session`).                  |
| Cross-origin nav in active tab       | SW does NOT inject. Starts a 3-min `wp-cross-grace:<tabId>` alarm.           |
| Return to original origin in grace   | SW clears alarm, re-injects.                                                 |
| Cross-grace alarm fires              | SW clears activation, messages tab `wp-hard-disconnect`, badge off.          |
| User clicks toolbar icon to turn off | SW messages `wp-deactivate` (UI tears down, WS stays open), 30s socket-grace alarm. |
| Re-toggle within 30s                 | SW clears alarm, messages `wp-remount` (existing WS reused).                 |
| Socket-grace alarm fires             | SW messages `wp-hard-disconnect` (WS closed).                                |
| Tab closes                           | `chrome.tabs.onRemoved` clears state and any pending alarms.                 |

## Icons

`icons/icon.svg` is the source (orange rounded square + white play triangle, matching
the ON-badge color `#f97316`). `icons/gen-icons.mjs` rasterizes it to PNGs at 16/32/48/128
via `sharp`. Regenerate only when the SVG changes:

```bash
node client/extension/icons/gen-icons.mjs
```

The committed PNGs are what the build copies, so a normal build does not need `sharp`.

## Build

```bash
npm run build:ext                        # → dist/extension/          (Chrome)
npm run build:firefox                    # → dist/extension-firefox/  (Firefox/Zen)
npm run build                            # both of the above + userscript
WS_URL=wss://… npm run build:ext         # bake prod relay
```

Install (Chrome): Extensions → Developer mode → Load unpacked → `dist/extension/`.

## Firefox / Zen

Zen is a Firefox fork, so the Gecko build covers both. `build.mjs`'s `firefox` target
emits `dist/extension-firefox/` from the *same* `background.ts` / `content.ts`, with two
deltas applied at build time:

- **Manifest:** `background.service_worker` → `background.scripts` (Gecko MV3 uses an
  event page, not a service worker — the alarms-based teardown design already assumes the
  background context can unload, so it ports cleanly). Adds `browser_specific_settings.gecko`
  (add-on id + `strict_min_version: 115.0`, the floor for `storage.session`).
- **Namespace shim:** a one-line banner aliases `chrome` → Gecko's promise-based `browser`,
  which is what the `await`s in the source expect. Chrome builds keep native `chrome`.

Install (Zen/Firefox, sideload): `about:debugging` → This Firefox → **Load Temporary Add-on**
→ pick `dist/extension-firefox/manifest.json`. Temporary add-ons clear on browser restart.

> **Host permissions are opt-in on Gecko.** Firefox treats `<all_urls>` as a permission the
> user grants per-site (toolbar-icon menu → permissions), so the first activation on a new
> site may require granting access before injection succeeds.
