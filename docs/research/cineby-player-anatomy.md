# Cineby player anatomy

Last verified: 2026-05-11.

## Observations

- Cineby is a third-party movie/TV aggregator. The site itself wraps third-party stream providers in an `<iframe>`.
- The actual playback happens via a standard HTML5 `<video>` element inside the iframe (not Shaka/Hls.js DRM, no Widevine).
- Source switching (different providers/qualities) **remounts the iframe**, which destroys and recreates the `<video>`. Sync must re-bind on mutation.
- Route changes between episodes are SPA (no full reload). In the userscript, the WS lives on `window` and survives. In a future extension, the service worker is what keeps the WS alive.

## Implications

- Userscript must run in both frames. Top-frame component runs the panel + WS. Iframe-bridge component runs in the player iframe, hooks `<video>`, talks to the top frame via `postMessage`.
- `MutationObserver` on `document.documentElement` catches video remounts.
- Pathname is a useful "are we watching the same thing" check, sent on `hello` and compared server-side.

## Open questions

- Do all Cineby stream providers actually expose a real `<video>` element, or do some use embedded players in nested iframes? Need to test against the 3-4 most-used providers.
- Does any provider have CSP that blocks userscript injection? If so, sync will silently fail for that source — the bridge should detect "no video found after 5s" and emit a warning to the panel.
