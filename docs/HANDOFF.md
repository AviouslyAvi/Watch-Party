# Watch-Party — Handoff

Last updated: 2026-05-26
Milestone: **v0.8.1 live on main — site-adapter buttons (YouTube, Cineby) + unmissable activator pill. Next bump is a patch (v0.8.2), not a minor.**

## Versioning convention (read this first)

Patch bumps for bug fixes AND small additive features. Minor bumps only when the user calls something a "real feature." Major bumps only when the user explicitly says so.

- `0.8.x` series is the current line. Next change ships as `v0.8.2`, then `v0.8.3`, etc.
- Bump the minor (e.g. → `v0.9.0`) only on the user's say-so.
- Bump the major (→ `v1.0.0`) only on the user's say-so.
- Do **not** "rewind" to a lower number — Tampermonkey's semver compare treats lower as a downgrade and refuses to update.

The recent jumps to `v0.7.0` (full off-toggle) and `v0.8.0` (site adapters) were over-bumps. Course-corrected from here on out.

## Status

- **v0.8.1 — live on main.** Activator visibility polish + boot console banner. Pill-shaped orange button with "Watch-Party" label and pulse animation replaces the easy-to-miss 40px 🎬 circle. `console.log` with version on boot for verification (`Watch-Party` filter in DevTools).
- **v0.8.0 — live on main.** Site-adapter buttons. New module `client/userscript/site-adapters/` with `youtube.ts` and `cineby.ts`. Button next to YouTube's Share; best-effort pill in Cineby's header (fallback to top-right fixed pill). Registry uses debounced MutationObserver for SPA re-mount. `BootHandle.copyInviteLink()` exposed for site buttons to trigger the in-panel copy flow.
- **v0.7.0 — live on main.** Full on/off toggle for the userscript path. Settings drawer → "Turn off Watch-Party here" persists `cp-off:<host>=1` in localStorage. `mountActivator()` becomes the dormant-state UI. Invite-link hashes override the disabled flag (same convention as the extension's onCommitted hash check). `index.ts` now owns the userscript lifecycle and swaps panel ↔ activator as state flips.
- **v0.6.2 — live on main.** Tab handle (`›`/`‹`) pulled out of the panel host into its own `position: fixed` element so hiding the panel doesn't drag the toggle off-screen. `Alt+Shift+W` keyboard shortcut added as a second escape hatch. Real bug — userscript users on Hidden layout had no way to reopen the panel.
- **v0.6.1 — live on main.** Auto-activate on invite-link clicks. SW's `webNavigation.onCommitted` + `onReferenceFragmentUpdated` listeners check for `#party=<id>` in URL hash and call `activate()` on un-activated tabs. Privacy model preserved — only fires on explicit invite signature, not arbitrary navigation.
- **v0.6.0 — live on main.** UX polish pass: settings drawer, layout modes (Overlay/Push/Hidden), operator crown, editable names with retroactive chat re-render, 6-step onboarding tour, Wong CB-safe palette, reaction send throttle.
- **v0.5.0 — live on main.** Click-to-activate model: extension dormant on every page load until the user clicks the toolbar icon. Service worker owns per-tab activation, programmatic injection, 3-min cross-domain grace, 30s socket re-toggle grace. Tab close cleans state. No declarative `content_scripts`.

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What this session shipped

### v0.6.1 → v0.8.1 (patch line going forward)

Patch-cadence batch on top of v0.6.0. From here forward, every increment is a `0.8.x` bump unless the user calls a real minor or major.

- **v0.6.1 — auto-activate on invite hash.** `client/extension/background.ts`. `hasPartyHash()` helper sniffs `#party=<id>` on top-frame nav; SW auto-activates on un-activated tabs via both `onCommitted` (fresh page loads) and `onReferenceFragmentUpdated` (SPA hash mutation). Joiners no longer need to click the toolbar icon after landing on an invite URL.
- **v0.6.2 — tab handle pinned to viewport.** `client/userscript/ui/panel.ts`. `cp-tab` is now a `position: fixed` sibling outside the panel host so `transform: translateX(320px)` (Hidden mode) doesn't drag it off-screen. `applyLayout()` updates its `right` offset (0 when hidden, SIDEBAR_WIDTH when visible). Also added `Alt+Shift+W` keyboard toggle as a second escape hatch.
- **v0.7.0 — userscript on/off toggle.** New `client/userscript/ui/activator.ts` with `isHostDisabled`/`setHostDisabled`/`mountActivator`. Settings drawer gains "Turn off Watch-Party here" — closes WS, destroys panel, persists `cp-off:<host>=1` in localStorage, mounts the activator. Activator click OR `Alt+Shift+W` reactivates. `index.ts` now owns the userscript lifecycle and picks panel-vs-activator on boot. Invite-link hashes override the disabled flag.
- **v0.8.0 — site-adapter buttons.** New `client/userscript/site-adapters/` directory. `index.ts` defines `SiteAdapter` interface + `runSiteAdapter()` with a debounced MutationObserver for SPA re-mount + `flashButton()` confirmation helper. `youtube.ts` finds Share via `aria-label*="Share" i` selectors across the 2026 `yt-button-view-model` and legacy `ytd-button-renderer` layouts, inserts a pill sibling. `cineby.ts` candidate-selector list against the Cineby header with fallback to top-right fixed pill on watch routes. `BootHandle.copyInviteLink()` added so site buttons can trigger the in-panel copy flow without reaching through panel internals.
- **v0.8.1 — activator visibility polish.** Pill-shaped orange button with "Watch-Party" label, soft pulse animation, animated halo ring. Replaces the easy-to-miss 40px 🎬 circle at 0.78 opacity. Boot-time `console.log` banner so users can verify the script is running and which version they have (filter `Watch-Party` in DevTools console).

### v0.6.0 (live on main)

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

User is currently smoking v0.8.1 against YouTube and Cineby. Outstanding diagnostic: did Tampermonkey auto-pull v0.8.1? (Check DevTools console for the orange `🎬 Watch-Party vX.X.X loaded` banner.) If on v0.7.x or earlier, force a TM update check from the dashboard.

**Whatever ships next**: bump as a patch (`v0.8.2`), not a minor. See "Versioning convention" above.

Open threads to pick from after smoke is clean:

1. **Tighten Cineby selectors.** Current adapter uses defensive candidate-selector list and falls back to a top-right fixed pill. Once user provides a screenshot or DOM dump of Cineby's header, swap to a precise selector so the button lands natively in their UI.
2. **Logo design.** Five ChatGPT image prompts are in the conversation tail of the v0.6.0-build chat. Once a winner is picked: downscale to 16/32/48/128 PNG, drop into `client/extension/icons/`, reference in `manifest.json` `action.default_icon` + `icons`, replace the badge-text state indicator with a real active/inactive icon swap via `chrome.action.setIcon({ tabId, ... })`.
3. **Chrome Web Store listing.** Real one-click install path. Blockers: logo (item 2), ~200 words store copy, privacy policy stub hosted on the landing, $5 dev account fee, ~3-day review.
4. **Service-worker WS migration** so cross-domain navigation can carry the live socket (not just session state). Today the WS dies with the page on nav; the SW grace window restores activation state but the socket reconnects.
5. **Additional settings ideas** flagged but not built: sound on chat, vanity room name, message-level reactions, keyboard shortcuts (`chrome.commands`), typing-privacy toggle.
6. **More site adapters.** Registry takes 5 lines per site. Candidates: Netflix, Disney+, Hulu, HBO Max, Crunchyroll, Twitch.

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
v0.8.1 is live on main. Recent batch (v0.6.1 → v0.8.1): auto-activate on
invite hash, panel toggle tab pinned to viewport, full on/off toggle for
userscript with per-host localStorage persistence, site-adapter buttons on
YouTube (next to Share) and Cineby (header pill, top-right fallback), and
an unmissable pulsing activator pill.

VERSIONING: patch bumps only (next is v0.8.2). Do not bump minor or major
unless I explicitly say so. Don't rewind versions — Tampermonkey treats
lower as a downgrade and refuses to update.

Immediate next step: confirm Cineby selectors land in the right spot once
the user sends a DOM dump, OR pick from the open threads list in the
handoff (logo design, Chrome Web Store listing, SW WS migration,
additional settings, more site adapters).
```
