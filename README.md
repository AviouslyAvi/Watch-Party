# Watch-Party

Teleparty-style synchronized watch party for **any site with a video player**. Ships as a Chrome MV3 extension (primary) and a Tampermonkey userscript (legacy), backed by a Cloudflare Worker + Durable Object relay.

## What you get

- Play / pause / seek sync between everyone in a room.
- Admin model: first joiner is admin. Admin can flip a **Free-for-all controls** switch — when off, only admin drives playback (viewers' attempts snap back). When on, anyone can.
- Right-edge sidebar with text chat, participant list, room link copy, onboarding-link copy for non-installers, optional room passphrase, and an in-app update banner when a new version ships.
- 128-bit room IDs and optional out-of-band passphrase — random scanners can't guess into your room.
- Native player controls (source switcher, subtitles, quality) stay fully functional.

## Install (users)

The extension is distributed as an unpacked MV3 folder. It's prebuilt and wired to the production relay — no build step needed.

1. Download or clone the [`extension-build/`](./extension-build/) folder from this repo.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select `extension-build/`.
5. Pin it from the puzzle-piece menu.

See [`extension-build/README.md`](./extension-build/README.md) for the user-facing install/update guide.

### Use

1. Open any page with a `<video>` element.
2. The Watch-Party sidebar appears on the right edge. Enter a display name → **Join chat**.
3. Click **Copy room link** and send it to a friend who already has the extension → instant party.
4. Friend doesn't have it installed? Click **Copy onboarding link** instead — the link routes them through the landing page with install steps first, then forwards them into your party automatically once the extension is detected.
5. Admin-only: click **🔒 Add room key** to set an out-of-band passphrase. Friends need both the new link and the key (sent separately) to join. Empty rooms reset the key.

### Updating

Unpacked extensions don't auto-update. The sidebar shows an update banner when a new version is available; pull the latest `extension-build/` and click the reload icon on `chrome://extensions`.

### Userscript (legacy)

The Tampermonkey userscript path still works for users who prefer it. Install Tampermonkey, then install `dist/avious-party.user.js` from a release. The extension is the recommended path.

## Develop

```bash
npm install
npm run dev:relay                              # ws://localhost:8787
WS_URL=ws://localhost:8787 npm run build       # → dist/avious-party.user.js + dist/extension/
npm run build:ext                              # MV3 extension only
npm run build:user                             # userscript only
npm run typecheck                              # tsc --noEmit
```

For the extension, point Chrome at `dist/extension/` via **Load unpacked**. For the userscript, paste `dist/avious-party.user.js` into Tampermonkey's editor.

## Deploy

```bash
npm run deploy:relay                                            # → wss://avious-party-relay.<account>.workers.dev
WS_URL=wss://avious-party-relay.<account>.workers.dev \
  npm run build:ext                                             # rebuild extension against prod relay
cp dist/extension/* extension-build/                            # promote to distribution folder, commit
npm run deploy:landing                                          # → Cloudflare Pages
```

The production relay currently runs at `wss://avious-party-relay.avibenabram.workers.dev`. Never bake `WS_URL` into committed source — pass it through build env, and only the prebuilt `extension-build/` should carry it.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the full workspace map and per-workspace `CONTEXT.md` files. TL;DR:

- `shared/` — pure sync engine + protocol types. No DOM, no network.
- `client/extension/` — Chrome MV3 extension (v2, primary).
- `client/userscript/` — Tampermonkey wrapper (v1, legacy).
- `relay/` — Cloudflare Worker + Durable Object, one room per session.
- `landing/` — static onboarding site on Cloudflare Pages, points users at the extension folder.
- `extension-build/` — committed prebuilt extension wired to the production relay; what users load unpacked.
- `docs/` — decisions, research, active `HANDOFF.md`.

## Changelog

### Unreleased — landing deep-link helper (on `main`, not yet redeployed)

- `f081741` Add landing deep-link helper for non-installers — new "Copy onboarding link" button in the sidebar generates a wrapper URL through `watch-party.pages.dev` carrying the video URL + party id; landing parses the fragment, shows a tailored "You've been invited" hero, and auto-forwards when the extension's `data-watch-party-installed` marker is detected.

### v0.3.0 — Room hardening (2026-05-16)

- `cbe2e27` v0.3.0: rebuild extension with room hardening (passphrase + 128-bit IDs).
- `58ba6b2` Harden rooms: 128-bit room IDs (22-char base64url tokens) + optional passphrase gate. Relay pins the passphrase on first connection; mismatched joiners get a `4001` close with a "Wrong room key" banner. Empty rooms reset the pin so admins can change or clear the key.

### v0.2.x — CI/CD + distribution

- `bcaafc2` docs: update CI/CD handoff to shipped state.
- `e56ef06` ci: GitHub Actions workflows for typecheck + Cloudflare deploy.
- `063685d` README: lead with extension install, demote userscript to legacy.
- `d8f0b24` Document v0.2.0 ship + Cloudflare deploy + distribution decisions.
- `4e9c6f1` Add handoff for GitHub Actions CI/CD setup.
- `b666895` Landing: switch to extension distribution, rename Pages project.

### v0.2.0 — MV3 extension (shipped)

- `bb5f6d4` v0.2.0: in-extension update banner.
- `8ef0134` Wire `extension-build/` to production relay.
- `ff4eee2` Replace `prompt()` with in-panel name gate.
- `67a3e10` Add prebuilt extension under `extension-build/`.
- `9aadac9` Convert floating panel into right-edge sidebar.

### Foundation

- `670acda` Add AGPL-3.0 license.
- `8254b4f` chore: gitignore secrets and env files.
- `62e5bcb` docs: three-layer routing system (`CLAUDE.md` router + per-workspace `CONTEXT.md`).

## Roadmap

- Deploy the landing deep-link helper to Cloudflare Pages, then cut v0.3.1 (or roll into v0.4.0) so users get the new "Copy onboarding link" button via the update banner.
- Service-worker WS to survive SPA episode changes.
- Extension icon (still Chrome's puzzle-piece default).
- Wrangler v4 upgrade.
- Shared cursor, emoji reactions, optional Web Store listing.

## Caveats

The extension uses `all_frames: true` + `match_about_blank: true` so the content script reaches cross-origin player iframes (where the `<video>` element often lives). A runtime check decides whether to mount the sidebar (top frame) or run the iframe bridge. If a stream provider blocks the content script via CSP, that source won't work — switch source in the player if the site offers one.
