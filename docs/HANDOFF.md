# Watch-Party — Handoff

Last updated: 2026-05-26
Milestone: **v0.6.0 committed locally — UX polish pass (settings, layout modes, operator crown, editable names, onboarding tour). Awaits push to main.**

## Status

- **v0.6.0 — committed, not pushed.** Commit `8c3a8fd` on branch `claude/nice-shannon-4af022`. Big UX pass on top of v0.5.0. Manual smoke pending. **Action owed: push to main** (direct-to-main is now allowlisted in `~/.claude/settings.json`).
- **v0.5.0 — live on main.** Click-to-activate model: extension dormant on every page load until the user clicks the toolbar icon. Service worker owns per-tab activation, programmatic injection, 3-min cross-domain grace, 30s socket re-toggle grace. Tab close cleans state. No declarative `content_scripts`. Commit `ca9d1ca`; CI auto-synced `extension-build/` on top as `e6dd202`.

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What this session shipped

### v0.6.0 (committed locally, not pushed yet)

UX polish pass covering everything the user flagged in a single ticket. Eight asks → eight features:

- **Layout modes** (Overlay / Push / Hidden). Three-button selector in the panel header. Push reflows the page via `documentElement.style.marginRight = "320px"` and caches the original value for restore. Fullscreen change events force Hidden and restore on exit. Persisted to `cp-settings-v1`. [client/userscript/ui/panel.ts](client/userscript/ui/panel.ts)
- **Reaction throttle** — 2 s per-client send throttle with visual dim/flash on the reactions row. Server cap (5/10s) stays as backstop.
- **Update-check semver fix.** Replaced string equality with `gt()` helper. Cache key bumped to `cp-update-check-v2` so users with stale `v0.4.1` cached responses get fresh data. [client/userscript/main.ts](client/userscript/main.ts)
- **Settings drawer.** Gear ⚙ icon in panel header. Drawer includes: edit display name, background + text color pickers, opacity slider (0.6–1.0), text-size slider (11–18 px), colorblind mode (Wong palette — single CB-safe palette for deuter/protan/tritan modes), high-contrast toggle, timestamp toggle, "Replay onboarding tour" button. Persisted to `localStorage.cp-settings-v1`. Themed via CSS variables (`--cp-bg`, `--cp-text`, `--cp-bg-opacity`, `--cp-font-size`).
- **Editable display name with retroactive update.** New `RenameMsg` wire type. Client maintains `Map<ClientId, string>` from participant snapshots; `applyRename()` walks `chatLog[]` and re-renders prior chat lines so historical messages pick up the new name. Server enforces 5 s cooldown per conn. Other peers see the rename in their own historical chat too.
- **Operator crown (co-admin).** Server tracks `operators: Set<ClientId>` alongside `adminId`. `canDrive()` admits admin OR operators OR free-for-all. Two new wire messages — `PromoteMsg`, `DemoteMsg` — admin-only. Admin sees give-⭐ / remove-⭐ buttons next to each non-admin participant. Operators cleared on admin transfer (fresh slate for the next admin). The existing `shared/sync.ts` `canEmit` gate didn't need a signature change; main.ts now passes a `canDrive()` predicate into the existing `isAdmin` callback.
- **Inline onboarding coachmark tour.** 6-step spotlighted walkthrough on first connection (gated by `localStorage.cp-onboarded-v1`). Spotlight via the `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` trick. Steps: welcome → copy link → name → reactions → layout modes → settings. Replayable from settings. [client/userscript/ui/coachmark.ts](client/userscript/ui/coachmark.ts)
- **Wong CB-safe peer palette.** `peer-color.ts` accepts a `ColorblindMode` argument and returns the matching palette for the participant list, chat author colors, reaction names, and typing indicator. Single Wong palette for all three CB modes — distinction in settings is just on/off semantically.

Protocol diff: [shared/protocol.ts](shared/protocol.ts) gained `RenameMsg`, `PromoteMsg`, `DemoteMsg`. `welcome` and `participants` now carry `operators: ClientId[]`. `Participant` gained `isOperator: boolean`. Manifest + banner bumped to 0.6.0.

### v0.5.0 (live on main)

- **Dormant-by-default extension.** Dropped `content_scripts` from `manifest.json` entirely. Service worker (`background.ts`) owns activation:
  - Toolbar click → `chrome.scripting.executeScript` injects `content.js` (all frames) for that tab. Records `{ origin, activatedAt }` in `chrome.storage.session`. Sets "ON" badge.
  - Same-origin reload / SPA nav → SW re-injects via `webNavigation.onCommitted`.
  - Cross-origin nav → 3-min `wp-cross-grace:<tabId>` alarm; return restores; expiry hard-disconnects.
  - Click-to-deactivate → message tab `wp-deactivate` (tear down UI, keep WS), 30s `wp-socket-grace:<tabId>` alarm; re-toggle within window reuses the connection.
  - Tab close → cleanup.
- **`window.__WATCH_PARTY__` sentinel** in `content.ts` so re-injection after soft teardown remounts the existing instance instead of double-booting. Iframes still always run the bridge.
- **Userscript refactor:** boot logic split into `main.ts` (returns `{ teardownUI, remountUI, shutdown }`) + `userscript/index.ts` (auto-boot wrapper for v1).
- **Panel becomes re-mountable**: participants snapshot + pending update banner restored on remount; `destroy()` added.
- **Build:** `build.mjs` bundles `background.js` alongside `content.js`. Extension entry moved to `extension/content.ts`. Userscript entry moved to `userscript/index.ts`.

Live since commit `ca9d1ca` on main.

## What earlier sessions shipped (kept for context)

- **v0.4.1 release.** Typing indicator (1.5s send throttle, 3s receiver decay). Squash-merged via [PR #3](https://github.com/AviouslyAvi/Watch-Party/pull/3) as `48108f8`.
- **CI hardening: Node 22 pin + manual-dispatch lever.** `actions/setup-node@v4` with `node-version: 22` for `landing` + `relay`. `workflow_dispatch` with `force_relay` / `force_landing` inputs.
- **v0.4.0 release.** Emoji reactions merged via [PR #2](https://github.com/AviouslyAvi/Watch-Party/pull/2) (squash `62d49c3`).
- **v0.3.1 release.** Manifest + banner bump, CI rebuilt + published.
- **Landing deep-link helper.** "Copy onboarding link" button in panel; landing parses `v/party/key` fragment.
- **Wrangler 3 → 4.92.0 upgrade.** CI path-filtered.
- **v0.3.0 room hardening.** 128-bit room IDs, optional passphrase, rejection banner.
- **Peer-color hash (commit `272a95f`).** Deterministic color per ClientId. Pure client-side cosmetic, no protocol change. (Replaced in v0.6.0 by the Wong-palette-aware version.)

Recent commits on `claude/nice-shannon-4af022` (most recent first):
- `8c3a8fd` — feat(v0.6.0): UX polish pass — settings, layout modes, operator crown, editable names, onboarding tour **(not yet on main)**
- `e6dd202` — ci: sync extension-build/ for v0.5.0 [skip ci] *(on main)*
- `ca9d1ca` — feat(extension): dormant-by-default, click-to-activate per tab *(on main)*
- `272a95f` — feat: deterministic peer color per ClientId *(on main)*

Releases: [v0.4.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.1) · [v0.4.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.0) · [v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1) · [v0.3.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.0)

## Exact next step

1. **Push v0.6.0 to main.** From the worktree:

    ```bash
    git push origin claude/nice-shannon-4af022:main
    ```

    CI will auto-cut a `v0.6.0` GitHub release (path filter on `client/extension/manifest.json`), redeploy the relay (path filter on `relay/**` + `shared/**`), and the auto-sync bot will commit `extension-build/` for v0.6.0 on top of main.

2. **Manual smoke against prod after release.** Two browser profiles in two different normal Chrome windows (or one Chrome + one Tampermonkey). Walk through:
    - Both profiles reload from the new v0.6.0 zip (extension) or wait for the auto-update banner (userscript).
    - Toolbar icon → onboarding tour fires (6 steps), all anchors hit.
    - Layout modes Overlay / Push / Hidden each behave; Push reflows the page; fullscreen forces Hidden then restores.
    - Spam 👍 — only one reaction every 2 s, row dims briefly on throttle.
    - Settings drawer: change bg color, text color, opacity, font size, colorblind mode, high contrast — all retheme live and persist across reload.
    - **Edit name from settings** — Profile A renames, both profiles see chat history retroactively update to the new name within ~1 s.
    - **Operator crown** — Profile A (admin) clicks "give ⭐" next to Profile B; B can now play/pause; admin removes ⭐ → revoked. Disconnect A; B becomes admin with an empty operators set.
    - Update banner: temporarily edit `VERSION` in the userscript console to `0.4.0` and confirm the banner shows `v0.6.0`. Back to `0.6.0` → no banner for older tags.

Pick one after smoke:

3. **Logo design.** Five ChatGPT image prompts are in the conversation tail of the v0.6.0-build chat — iterate on cinema-seats-+-Wi-Fi and speech-bubble-+-play first. Once a winner is picked: downscale to 16/32/48/128 PNG, drop into `client/extension/icons/`, reference in `manifest.json` `action.default_icon` + `icons`, replace the badge-text state indicator with a real active/inactive icon swap via `chrome.action.setIcon({ tabId, ... })`.
4. **Service-worker WS migration** so cross-domain navigation can carry the live socket (not just session state). Today the WS dies with the page on nav; the SW grace window restores activation state but the socket reconnects. Real scoped follow-up; flagged but not in v0.6.0.
5. **Eyeball v0.5.0 dormancy + cross-domain grace in prod** for a sustained session (>3 min of cross-domain nav in one active tab). Validate the alarm-based teardown actually fires.

## Open decisions

- Whether to surface the passphrase UI to non-admins as a read-only "🔒 This room is keyed" indicator, or keep it admin-only and invisible (current).
- The "additional settings ideas" not built into v0.6.0: sound on chat, vanity room name, message-level reactions, keyboard shortcuts (`chrome.commands`), typing-privacy toggle. None blocked; need a user nod to scope into v0.7.

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on receiver if they haven't clicked the page. Mute-first-then-unmute mitigation still unimplemented.
- CSP-locked stream providers on Cineby still won't accept the content script.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- **Settings refactor risk**: panel.ts is now ~600 lines. If something visual breaks on a specific site, suspect (a) the `color-mix(in srgb, ...)` in the panel background — requires Chrome 111+, safe assumption but worth flagging — or (b) `documentElement.marginRight` push behaving badly with sites that already set their own margin.
- **Operator crown semantics**: the current model — admin alone can promote/demote — is intentionally simple. If the user later wants operators to also be able to promote others, the server's `case "promote"` guard widens and the UI button needs to render for operators too.
- **CI's `deploy.yml` is load-bearing.** Bumping `client/extension/manifest.json` → auto-cut release. Bumping `landing/**` → auto-deploy. Bumping `relay/**` or `shared/**` → relay redeploy. v0.6.0 touches `shared/protocol.ts` *and* `relay/room.ts` *and* the manifest — so the push will trigger all three (release + relay deploy + extension-build sync). If relay deploy fails, the new wire messages (`rename`/`promote`/`demote`) will silently no-op server-side. Retry with `gh workflow run deploy.yml --ref main -f force_relay=true`.
- ✅ Wrangler v4 on Node 22 is healthy in CI.

## Threat model in plain terms

(Unchanged from v0.4.1; operator crown additions don't change the surface.)

- **Random scanner hitting your relay URL** with a guessed room: blocked by 128-bit entropy.
- **Friend forwards your full URL to someone you didn't intend:** still in. Use a passphrase if this matters.
- **OOB protection:** "🔒 Add room key" as admin, share key separately.
- **Reaction spam:** capped 5/10s per conn at the relay; allowlist blocks custom-emoji injection.
- **Rename spam:** 5s server-side cooldown per conn; excess silently dropped.
- **Self-promote attempt:** server `case "promote"` guards `conn.id !== adminId` — non-admin promote/demote silently dropped.
- **Typing-event spam:** server rewrites `from`/`name` from trusted conn so identity-spoofing is blocked; client throttle bounds normal volume.

---

## Resume prompt (paste into a fresh chat)

```text
Continue work on the Watch-Party Chrome extension.

Repo root in the worktree:
/Users/aviouslyavi/Claude/Projects/Watch-Party/.claude/worktrees/nice-shannon-4af022

Before doing anything, read docs/HANDOFF.md — it has the full status. Briefly:
v0.6.0 (UX polish pass — settings drawer, layout modes, operator crown,
editable names, onboarding tour) is committed locally as `8c3a8fd` on branch
`claude/nice-shannon-4af022` but not yet pushed. v0.5.0 (dormant-by-default
click-to-activate) is already live on main.

Immediate next step: push v0.6.0 to main
(`git push origin claude/nice-shannon-4af022:main` — direct-to-main is
allowlisted globally) and then walk me through the manual smoke checklist in
the "Exact next step" section of the handoff.

Open threads after smoke (pick whichever I ask for next): logo design + icon
swap, SW WS migration so cross-domain nav keeps the socket alive, and the
"additional settings ideas" not yet built (sound on chat, vanity room name,
keyboard shortcuts, typing-privacy toggle).
```
