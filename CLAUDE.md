# cineby-party — root router (Layer 1)

You are working in the **cineby-party** repo: a Teleparty-style synchronized watch party for [cineby.sc](https://www.cineby.sc/). Ships as a Tampermonkey userscript (v1) backed by a Cloudflare Worker relay, with a Chrome extension planned for v2.

## Floor plan

| Workspace          | What lives here                                                    | When to enter                                     |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| `shared/`          | Pure sync engine + protocol types. No DOM. No network.             | Editing play/pause/seek logic or message shapes.  |
| `client/userscript/` | Tampermonkey userscript: video hooks, iframe bridge, floating UI. | Editing anything the user sees in the browser.    |
| `client/extension/` | (v2) MV3 Chrome extension wrapper. Empty in v1.                   | When v1 ships and you're starting the extension.  |
| `relay/`           | Cloudflare Worker + Durable Object. Room state, broadcast, perms.  | Editing room logic, permissions, or deploy.       |
| `docs/`            | Decisions, research notes, handoff.                                | Logging a decision or resuming from a new chat.   |

**Always** read the `CLAUDE.md` inside a workspace before editing files there. It contains workspace-specific pipeline rules.

## Routing table

| Task                                  | Read                                                                  | Skip                          | Skills/MCP                |
| ------------------------------------- | --------------------------------------------------------------------- | ----------------------------- | ------------------------- |
| Edit sync logic (play/pause/seek)     | `shared/CLAUDE.md`, `shared/sync.ts`, `shared/protocol.ts`            | `client/extension/`, `docs/`  | —                         |
| Debug video element detection         | `client/CLAUDE.md`, `client/userscript/main.ts`, `iframe-bridge.ts`   | `relay/`, `shared/`           | playwright                |
| Change room/permission server logic   | `relay/CLAUDE.md`, `relay/room.ts`, `relay/worker.ts`                 | `client/`                     | —                         |
| Build & release a new userscript      | `client/CLAUDE.md`, `build.mjs`, `client/userscript/banner.txt`       | `relay/`                      | —                         |
| Start v2 extension                    | `client/CLAUDE.md`, `client/extension/`                               | `client/userscript/main.ts`   | —                         |
| Resume work in a new chat             | `docs/HANDOFF.md`                                                     | everything else               | —                         |

## Naming conventions

- Decision logs: `docs/decisions/YYYY-MM-DD-<slug>.md`
- Research notes: `docs/research/<topic>.md`
- Built userscript: `dist/cineby-party.user.js` (gitignored; only tagged releases land in `releases/`)
- Branches: `feat/<slug>`, `fix/<slug>`
- Commit style: imperative, no Claude co-author tag unless the user asks.

## Hard rules

- `shared/` must stay DOM-free and network-free. If you want a `document` or a `WebSocket`, you're in the wrong workspace.
- Never bundle the production relay URL into source. Read it from `WS_URL` build env, fall back to `ws://localhost:8787` for dev.
- Don't commit `dist/`. Don't commit `.dev.vars` or any Cloudflare secrets.
