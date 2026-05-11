# Cineby Party

Teleparty-style synchronized watch party for [cineby.sc](https://www.cineby.sc/). Ships as a Tampermonkey userscript backed by a Cloudflare Worker relay.

## What you get

- Play / pause / seek sync between everyone in a room.
- Admin model: first joiner is admin. Admin can flip a "Free-for-all controls" switch — when off, only admin can drive playback (viewers' attempts snap back). When on, anyone can.
- Floating panel with text chat, participant list, room link copy.
- Native Cineby controls (source switcher, subtitles, quality) stay fully functional.

## Install (users)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click the raw URL of `dist/cineby-party.user.js` from a release — Tampermonkey will prompt to install.
3. Open any movie/show on cineby.sc. Panel appears bottom-right.
4. Click **Copy room link**, send to friends. They open the link with the userscript installed → instant party.

There's also a companion landing page (Cloudflare Pages) that hosts the install link and a "create a room" form. It does **not** run the sync — same-origin policy blocks any hosted page from touching Cineby's video. The userscript is the part that actually works.

## Develop

```bash
npm install
npm run dev:relay         # ws://localhost:8787
WS_URL=ws://localhost:8787 npm run build   # → dist/cineby-party.user.js
```

Paste `dist/cineby-party.user.js` into Tampermonkey's editor for fast iteration.

## Deploy

```bash
npm run deploy:relay      # → wss://cineby-party-relay.<account>.workers.dev
WS_URL=wss://cineby-party-relay.<account>.workers.dev npm run build
npm run deploy:landing    # → https://cineby-party.pages.dev (or custom domain)
```

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the workspace map. TL;DR: `shared/` is the pure sync engine, `client/userscript/` wraps it for Tampermonkey, `relay/` is a Cloudflare Worker + Durable Object holding one room per session.

## Roadmap

- v1 (now): userscript + FFA toggle + chat.
- v2: Chrome MV3 extension, permanent admin + handoff, shared cursor, emoji reactions.

## Caveats

Cineby is a third-party aggregator that loads streams from cross-origin providers. The userscript matches `*://*/*` so it can run in the player iframe — it only activates the UI on `cineby.sc` itself. If a stream provider blocks userscripts via CSP, source switching is the workaround.
