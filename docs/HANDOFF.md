# avious-party — Handoff

Last updated: 2026-05-11

## Status

v1 scaffolded **and rebranded from "Cineby Party" to "Avious Party"** (now a generic any-site watch-party tool, not cineby-specific). `npm install` done; `npm run typecheck` clean; `npm run build` produces `dist/avious-party.user.js`; relay boots via `npm run dev:relay` and accepts WS handshakes (verified with a node ws smoke test). GitHub repo lives at `github.com/AviouslyAvi/cineby-party` and **needs to be renamed** to `avious-party` (see Exact next step).

Companion landing page (`landing/`) generalized to accept any http(s) URL. Not yet deployed to Cloudflare Pages.

## What's done

- Three-layer routing: root `CLAUDE.md` + `shared/`, `client/`, `relay/`, `docs/` per-workspace `CLAUDE.md`.
- `shared/protocol.ts` — wire message types.
- `shared/sync.ts` — `createSyncClient` pure engine with `VideoAdapter` injection, drift correction, suppress flag.
- `relay/room.ts` — Durable Object: admin = first joiner, server-enforced permissions, revert messages.
- `relay/worker.ts` — fetch handler routing `/ws?room=` to DOs.
- `client/userscript/main.ts` — top-frame entry: WS, sync wiring, video adapter that supports both top-frame and iframe video. Host gate removed; activates on any top-frame page.
- `client/userscript/iframe-bridge.ts` — runs in cross-origin iframe, postMessages events to top.
- `client/userscript/ui/panel.ts` — draggable floating panel with chat + FFA toggle.
- `build.mjs` — esbuild bundling with Tampermonkey banner + `WS_URL` define.
- `landing/` — static companion page with install button and "create a room" form. Accepts any http(s) URL.
- Local install + typecheck + build verified. Relay WS handshake verified locally.

## Exact next step

1. Two-browser verification (manual, requires user): start `npm run dev:relay`, install `dist/avious-party.user.js` into Tampermonkey on two browser profiles, walk through `/Users/aviouslyavi/.claude/plans/sure-but-i-want-ancient-haven.md`.
2. `gh repo rename avious-party` (renames `cineby-party` repo on GitHub).
3. Rename local checkout: `mv ~/Claude/Personal/cineby-party ~/Claude/Personal/avious-party`.
4. Update git remote URL after repo rename: `git remote set-url origin https://github.com/AviouslyAvi/avious-party.git`.
5. `wrangler deploy --config relay/wrangler.toml`, rebuild with `WS_URL=wss://avious-party-relay.<account>.workers.dev`, retest.
6. `npm run deploy:landing`.

## Open decisions for Avi

- Whether to publish the built userscript via GitHub release vs raw URL on `main`.
- v2 extension scoping — start after v1 has been used in a real watch session.
- Whether to narrow the `@match *://*/*` once we know which target sites matter (currently injects on every site, with a runtime check that only mounts UI if a `<video>` is present in the top frame).

## Known unknowns / risks

- Sites with nested iframes and CSP-blocked userscripts won't work; `docs/research/cineby-player-anatomy.md` has notes on one specific site's player as a worked example.
- WS reconnect on close is naive (2s fixed); fine for v1, revisit if friends report flakiness.
- No automated tests yet. `shared/sync.ts` is the obvious unit-test target.
