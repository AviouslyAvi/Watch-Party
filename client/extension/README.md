# v2: Chrome MV3 extension

Dormant-by-default. Clicking the toolbar icon turns it on for the current tab; clicking again turns it off. No allowlist of "supported sites" — the user decides per tab.

## Files

- `manifest.json` — MV3. No `content_scripts`. Declares a background service worker, the action button, and `<all_urls>` host permission so the SW can programmatically inject on click.
- `background.ts` — service worker. Owns per-tab activation state in `chrome.storage.session`, handles toolbar clicks, programmatic injection via `chrome.scripting.executeScript`, re-injection on same-origin reload/nav via `chrome.webNavigation.onCommitted`, and grace-period teardowns via `chrome.alarms` (never `setTimeout` — SW unloads).
- `content.ts` — runs in iframes (always) and in top frames (only when SW injects). Top-frame instance is single-shot: a `window.__WATCH_PARTY__` sentinel makes a re-inject after soft teardown remount the UI on the existing instance instead of double-booting.

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

## Build

```bash
npm run build:ext                        # → dist/extension/
WS_URL=wss://… npm run build:ext         # bake prod relay
```

Install: Chrome → Extensions → Developer mode → Load unpacked → `dist/extension/`.
