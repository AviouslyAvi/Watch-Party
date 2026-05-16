# Watch-Party

Teleparty-style synchronized watch party for **any site with a video player**. Ships as a Chrome MV3 extension (primary) and a Tampermonkey userscript (legacy), backed by a Cloudflare Worker + Durable Object relay.

## What you get

- Play / pause / seek sync between everyone in a room.
- Admin model: first joiner is admin. Admin can flip a **Free-for-all controls** switch — when off, only admin drives playback (viewers' attempts snap back). When on, anyone can.
- Right-edge sidebar with text chat, participant list, room link copy, and an in-app update banner when a new version ships.
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
3. Click **Copy room link** and send it to a friend. They open the link with the extension installed → instant party.

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

## Roadmap

- v0.2.0 (shipped): MV3 extension, right-edge sidebar, in-app name gate, in-extension update banner.
- Next: service-worker WS to survive SPA episode changes, shared cursor, emoji reactions, optional Web Store listing.

## Caveats

The extension uses `all_frames: true` + `match_about_blank: true` so the content script reaches cross-origin player iframes (where the `<video>` element often lives). A runtime check decides whether to mount the sidebar (top frame) or run the iframe bridge. If a stream provider blocks the content script via CSP, that source won't work — switch source in the player if the site offers one.
