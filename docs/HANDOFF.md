# avious-party — Handoff

Last updated: 2026-05-11
Milestone: **Barebones-1**

## Status

Chrome MV3 extension shipping and verified working between two browser profiles on the same machine against Cineby. Userscript path still works in parallel. Three v1 bugs fixed in commit `ae9bd35` (now on `origin/main`):

1. Room link captured at boot instead of click time → shared link dropped the SPA path on sites like Cineby.
2. Spacebar (and other player shortcuts) in the chat input leaked through to the page's video.
3. Receiver showed a buffering spinner on every remote play/pause because the engine seeked unconditionally before pausing.

The relay is **only running locally** (`ws://localhost:8787`). Friend-to-friend testing fails because their machine has nothing on that port. Wrangler is not logged in yet.

## What's done since the last handoff

- `client/extension/manifest.json` + `content.ts` — MV3 wrapper with `all_frames: true` + `match_about_blank: true` so the content script reaches Cineby's cross-origin player iframe without depending on Tampermonkey's per-user iframe-injection setting.
- `build.mjs` + `package.json` — `TARGET=user|ext|all` (`npm run build:user|build:ext|build`). Outputs `dist/extension/` ready for "Load unpacked".
- Three fixes listed in Status above. Drift-check before seek now applies to play and pause; seek still applies unconditionally to remote `seek` messages.

## Exact next step

1. **Avi: log into Cloudflare** so the relay can be deployed:
   ```
   ./node_modules/.bin/wrangler login
   ```
2. Next chat: `npm run deploy:relay` to produce the `wss://avious-party-relay.<account>.workers.dev` URL.
3. Rebuild the extension pointed at it:
   ```
   WS_URL=wss://avious-party-relay.<account>.workers.dev npm run build:ext
   ```
4. Zip `dist/extension/` and send to the friend; both sides reload the unpacked extension.
5. Optional: `npm run deploy:landing` once the relay URL is committed somewhere referenceable.

## Open decisions for Avi

- Whether to ship icons before the first share (Chrome will use a generic puzzle-piece icon otherwise — fine but unbranded).
- Whether to keep the userscript target alive after the extension is the primary path, or drop it.
- v2 service-worker WS migration so SPA navigation between episodes doesn't drop the connection. Defer until friends actually complain.

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on the receiver if they haven't clicked the page. Mitigation idea: mute-first-then-unmute on receiver's initial sync, since muted video bypasses autoplay block. Not implemented.
- CSP-locked stream providers on Cineby still won't accept the content script; user works around it by switching source in the player.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- `dist/` is gitignored; built artifact lives only on the build machine. Friend-distribution today is a zipped folder, not a release pipeline.
