# cineby-party — Handoff

Last updated: 2026-05-11

## Status

v1 scaffolded. All routing files (`CLAUDE.md` at root + each workspace), the shared sync engine, the relay (Cloudflare Worker + Durable Object), and the Tampermonkey userscript are written but **not yet built or tested**. No `npm install` has been run. Repo not yet pushed to GitHub.

## What's done

- Three-layer routing: root `CLAUDE.md` + `shared/`, `client/`, `relay/`, `docs/` per-workspace `CLAUDE.md`.
- `shared/protocol.ts` — wire message types.
- `shared/sync.ts` — `createSyncClient` pure engine with `VideoAdapter` injection, drift correction, suppress flag.
- `relay/room.ts` — Durable Object: admin = first joiner, server-enforced permissions, revert messages.
- `relay/worker.ts` — fetch handler routing `/ws?room=` to DOs.
- `client/userscript/main.ts` — top-frame entry: WS, sync wiring, video adapter that supports both top-frame and iframe video.
- `client/userscript/iframe-bridge.ts` — runs in cross-origin iframe, postMessages events to top.
- `client/userscript/ui/panel.ts` — draggable floating panel with chat + FFA toggle.
- `build.mjs` — esbuild bundling with Tampermonkey banner + `WS_URL` define.
- Docs: decision log for the stack choice, research note on Cineby player anatomy.

## Exact next step

1. `cd ~/Claude/Personal/cineby-party && npm install`
2. `npm run typecheck` — fix any TS errors.
3. `npm run dev:relay` (separate terminal) — confirms wrangler boots the DO.
4. `npm run build` — confirms esbuild produces `dist/cineby-party.user.js`.
5. Install in Tampermonkey on two browser profiles, open the same Cineby movie, walk through the verification plan in `/Users/aviouslyavi/.claude/plans/sure-but-i-want-ancient-haven.md`.
6. `wrangler deploy`, rebuild with prod `WS_URL`, retest.
7. `gh repo create aviouslyavi/cineby-party --public --source=. --remote=origin --push`.

## Open decisions for Avi

- GitHub username for the repo: assumed `aviouslyavi`. Confirm before pushing.
- Whether to publish the built userscript via GitHub release vs raw URL on `main`.
- v2 extension scoping — start after v1 has been used in a real watch session.

## Known unknowns / risks

- Cineby stream providers may vary in whether they expose a real `<video>` element or use nested iframes (see `docs/research/cineby-player-anatomy.md`).
- WS reconnect on close is naive (2s fixed); fine for v1, revisit if friends report flakiness.
- No automated tests yet. `shared/sync.ts` is the obvious unit-test target.
