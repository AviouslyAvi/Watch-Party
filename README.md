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
npm run dev:relay         # ws://localhost:8787
WS_URL=ws://localhost:8787 npm run build   # → dist/avious-party.user.js
```

Paste `dist/avious-party.user.js` into Tampermonkey's editor for fast iteration.

## Deploy

```bash
npm run deploy:relay      # → wss://avious-party-relay.<account>.workers.dev
WS_URL=wss://avious-party-relay.<account>.workers.dev npm run build
npm run deploy:landing    # → https://avious-party.pages.dev (or custom domain)
```

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the workspace map. TL;DR: `shared/` is the pure sync engine, `client/userscript/` wraps it for Tampermonkey, `relay/` is a Cloudflare Worker + Durable Object holding one room per session.

## Roadmap

- v1 (now): userscript + FFA toggle + chat.
- v2: Chrome MV3 extension, permanent admin + handoff, shared cursor, emoji reactions.

## Caveats

The userscript matches `*://*/*` so it can run inside cross-origin player iframes (where the actual `<video>` element often lives). A runtime check decides whether to mount the UI (top frame) or run the iframe bridge. If a stream provider blocks userscripts via CSP, that page won't work — try a different source if the site offers one.
