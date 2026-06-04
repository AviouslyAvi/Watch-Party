# Watch-Party — router (Layer 1)

Teleparty-style synchronized watch party for **any site with a video player**. Ships as a Tampermonkey userscript (v1) + Chrome MV3 extension (v2), backed by a Cloudflare Worker + Durable Object relay. TypeScript monorepo, no framework.

## Floor plan

| Workspace            | What lives there                                                       | Room file                       |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `shared/`            | Pure sync engine + protocol types. No DOM, no network.                 | `shared/CONTEXT.md`             |
| `client/`            | Browser-side: userscript (v1) + MV3 extension (v2). Video hooks, UI.   | `client/CONTEXT.md`             |
| `relay/`             | Cloudflare Worker + Durable Object. Room state, broadcast, permissions.| `relay/CONTEXT.md`              |
| `landing/`           | Static onboarding site (Cloudflare Pages). Install + room creator.     | `landing/CONTEXT.md`            |
| `docs/`              | Decisions, research, the active `HANDOFF.md`.                          | `docs/CONTEXT.md`               |

The legacy per-room `CLAUDE.md` files are still present for backward compatibility — they say the same things as the `CONTEXT.md` next to them.

## Routing table

| Task                                       | Read                                                                        | Skip                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------- |
| Edit sync logic (play/pause/seek/drift)    | `shared/CONTEXT.md`, `shared/sync.ts`, `shared/protocol.ts`                 | `client/extension/`, `docs/`            |
| Debug video element / iframe detection     | `client/CONTEXT.md`, `client/userscript/main.ts`, `iframe-bridge.ts`        | `relay/`, `shared/`                     |
| Change room / permission server logic      | `relay/CONTEXT.md`, `relay/room.ts`, `relay/worker.ts`                      | `client/`                               |
| Build + release a new userscript           | `client/CONTEXT.md`, `build.mjs`, `client/userscript/banner.txt`            | `relay/`                                |
| Work on v2 MV3 extension                   | `client/CONTEXT.md`, `client/extension/`                                    | `client/userscript/main.ts`             |
| Onboarding flow / landing page             | `landing/CONTEXT.md`, `landing/index.html`, `landing/app.js`                | `shared/`, `relay/`                     |
| Resume from a prior chat                   | `docs/HANDOFF.md`                                                           | everything else                         |
| Log a decision or research note            | `docs/CONTEXT.md`                                                           | code workspaces                         |

## Naming conventions

- Decision logs: `docs/decisions/YYYY-MM-DD-<slug>.md`
- Research notes: `docs/research/<topic>.md`
- Built userscript: `dist/avious-party.user.js` (gitignored).
- Built extension: `dist/extension/` (gitignored; "Load unpacked" target).
- Branches: `feat/<slug>`, `fix/<slug>`.
- Commits: imperative. No Claude co-author tag unless asked.

## Hard rules

- `shared/` must stay DOM-free and network-free. If you need `document` or `WebSocket`, you're in the wrong workspace.
- Never bundle the production relay URL into source. Read `WS_URL` from build env; fall back to `ws://localhost:8787` for dev.
- Don't commit `dist/`, `.dev.vars`, or any Cloudflare secrets.

### Versioning — patch bumps only

**Default: every release is a patch bump.** Current line is `0.8.x`. Next change ships as `v0.8.3`, then `v0.8.4`, `v0.8.5`, and so on. This is true for fixes AND for small additive features.

- Bump the **minor** (e.g. → `v0.9.0`) **only** when the user explicitly says so ("call this a minor", "ship v0.9", etc).
- Bump the **major** (→ `v1.0.0`) **only** when the user explicitly says so.
- **Never rewind** to a lower version — Tampermonkey's semver compare treats lower as a downgrade and refuses to update.
- The three files to bump in lockstep: `client/extension/manifest.json` `version`, `client/userscript/banner.txt` `@version`, and the tag CI cuts (which is derived from the manifest, so just keep those two in sync).
- The earlier jumps to `v0.7.0` and `v0.8.0` were mistakes. Don't repeat them.

## Commands

```bash
npm run dev:relay                  # ws://localhost:8787
npm run build                      # → dist/avious-party.user.js  + dist/extension/
npm run build:user                 # userscript only
npm run build:ext                  # extension only
WS_URL=wss://... npm run build     # prod build with relay URL baked in
npm run deploy:relay               # wrangler deploy
npm run deploy:landing             # wrangler pages deploy landing/
```
