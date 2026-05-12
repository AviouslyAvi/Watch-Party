# Watch-Party

Teleparty-style synchronized watch party for **any site with a video player**. Ships as a Tampermonkey userscript backed by a Cloudflare Worker relay.

## What you get

- Play / pause / seek sync between everyone in a room.
- Admin model: first joiner is admin. Admin can flip a "Free-for-all controls" switch — when off, only admin can drive playback (viewers' attempts snap back). When on, anyone can.
- Floating panel with text chat, participant list, room link copy.
- Native player controls (source switcher, subtitles, quality) stay fully functional.

## Install (users)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click the raw URL of `dist/avious-party.user.js` from a release — Tampermonkey will prompt to install.
3. Open any page with a video player. The floating panel appears bottom-right.
4. Click **Copy room link**, send to friends. They open the link with the userscript installed → instant party.

There's also a companion landing page (Cloudflare Pages) that hosts the install link and a "create a room" form. It does **not** run the sync — same-origin policy blocks any hosted page from touching another site's video. The userscript is the part that actually works.

## Develop

```bash
npm install
npm run dev:relay                              # ws://localhost:8787
WS_URL=ws://localhost:8787 npm run build       # → dist/avious-party.user.js + dist/extension/
npm run build:user                             # userscript only
npm run build:ext                              # MV3 extension only (v2, in progress)
npm run typecheck                              # tsc --noEmit
```

Paste `dist/avious-party.user.js` into Tampermonkey's editor for fast iteration. For the MV3 build, point Chrome at `dist/extension/` via "Load unpacked".

## Deploy

```bash
npm run deploy:relay                                          # → wss://avious-party-relay.<account>.workers.dev
WS_URL=wss://avious-party-relay.<account>.workers.dev npm run build
npm run deploy:landing                                        # → https://avious-party.pages.dev (or custom domain)
```

Never bake the production `WS_URL` into committed source — pass it through build env.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the full workspace map and per-workspace `CONTEXT.md` files. TL;DR:

- `shared/` — pure sync engine + protocol types. No DOM, no network.
- `client/userscript/` — Tampermonkey wrapper (v1).
- `client/extension/` — Chrome MV3 extension (v2, in progress).
- `relay/` — Cloudflare Worker + Durable Object, one room per session.
- `landing/` — static onboarding site on Cloudflare Pages.
- `docs/` — decisions, research, active `HANDOFF.md`.

## Roadmap

- v1 (now): userscript + FFA toggle + chat.
- v2: Chrome MV3 extension, permanent admin + handoff, shared cursor, emoji reactions.

## Caveats

The userscript matches `*://*/*` so it can run inside cross-origin player iframes (where the actual `<video>` element often lives). A runtime check decides whether to mount the UI (top frame) or run the iframe bridge. If a stream provider blocks userscripts via CSP, that page won't work — try a different source if the site offers one.
