# Watch-Party — Handoff

Last updated: 2026-06-21
Milestone: **v0.8.7 — committed + pushed, [PR #7](https://github.com/AviouslyAvi/Watch-Party/pull/7) OPEN + green (typecheck ✅, MERGEABLE/CLEAN), AWAITING MERGE. Fixes the one gap the v0.8.6 follow-test found: a first-time cross-origin follower now carries its display name in the follow URL hash and auto-rejoins instead of stalling at the name gate. Patch bump (manifest + banner → 0.8.7). v0.8.6 itself is fully SHIPPED. Next bump after this is v0.8.8, still patch.**

> **2026-06-21 session (4, cont.) — v0.8.7: cross-origin follow name-carry fix.** Closes the gap the follow-test surfaced (see session-4 note below). Client-only change in [client/userscript/main.ts](../client/userscript/main.ts) — shared by userscript AND extension:
> 1. `roomLinkForUrl()` gained an optional `name` arg; `startFollowCountdown()` passes the follower's own `me` into the follow target, so the destination URL becomes `…#party=<id>&key=<pp>&name=<follower>`.
> 2. `bootTopFrame()` boot path: when the URL hash carries `name=` and this origin has **no** stored name, it adopts + persists it to `localStorage` (`cp-name`), then strips the one-shot param. If a name is already stored here, it keeps that and just strips the param (never clobbers the user's chosen name).
> 3. `writeRoomFragment()` now also `delete`s `name` so the handoff param never lingers in the address bar.
> Why carry-the-name over a generic "Guest": `localStorage` doesn't cross origins, but the follower *knows* its name at follow time, so it keeps its identity, and the value self-heals (after the first follow it's in the new origin's `localStorage`). Fragments never hit the server and names are public in-room, so no new leak. **Verified: `tsc --noEmit` clean, `npm run build` emits all three targets, and a re-run of the follow harness against the LIVE prod relay passed 16/16** — including "follower auto-rejoined cross-origin WITHOUT re-typing name", name persisted to destination `localStorage`, `name=` stripped from URL, same-origin regression, and [Stay here] cancel. **Light theme also eyeballed this session** (Playwright screenshots): legible in normal mode (dark text on `#f7f7f8`, orange actions, red-on-pink danger button) AND high-contrast still overrides to pure `#000`/`#fff`. Both checks that were "still owed" are now done.
>
> **2026-06-21 session (4) — v0.8.6 shipped + verified.** Confirmed v0.8.6 landed end-to-end (session 3's work was never actually merged when that note was written). State as verified: feat commit `6f3bbd1` + CI sync `0b814f5` on `origin/main`; merged via [PR #6](https://github.com/AviouslyAvi/Watch-Party/pull/6); GitHub release [v0.8.6](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.8.6) carries `avious-party.user.js` + `watch-party-0.8.6.zip` + `watch-party-firefox-0.8.6.zip`. Deploy run [27910471008](https://github.com/AviouslyAvi/Watch-Party/actions/runs/27910471008): **all jobs green** — `extension-release` ✅, `relay` ✅ (wrangler-action ran → `navigate` handler is LIVE, NOT no-op'd), `landing` skipped (correct). Live relay returns HTTP 200. Deployed `navigate` handler ([relay/room.ts:163](../relay/room.ts)) verified to match the threat model: admin+operators only (excludes freeForAll), validates `http(s)`, re-stamps `from` from `conn.id`, clamps title to 200, no echo to sender. **Branch `claude/wp-v086` is fully merged** (`origin/main..claude/wp-v086` is empty).
>
> **Follow-the-host VERIFIED via automated harness (session 4) — 33/33 assertions across 3 runs.** Two-client follow test was run automatically (no longer "still owed"). Harness lived in `/tmp/wp-test/` (cleaned up — not in the repo). Three parts:
> - **Part A — protocol test against the LIVE prod relay** (raw `ws` clients, 11/11): admin `navigate` broadcasts to members + re-stamps `from` (anti-spoof) + no echo to sender; member `navigate` dropped; operator `navigate` allowed (after promote); `javascript:`/`file:` URLs rejected while `https:` accepted; **freeForAll ON still drops a member's `navigate`** (deliberate exclusion holds); `title` clamped to exactly 200. This is the server half that couldn't be checked locally — confirmed correct on the deployed Worker.
> - **Part B — browser UX (Playwright + chromium), same-origin** (11/11): host(admin) sees "Bring everyone here", follower(member) does not (display gating); follower gets the countdown banner ("Host moved to Destination Page B — following in 5s…", host's `document.title` forwarded); **[Stay here] cancels** (banner hides, no nav even past 5s); on expiry the follower auto-navigates to the host's bare URL with its own `#party=` hash re-appended, re-boots, re-joins the same room, and resyncs (participant count returns to 2).
> - **Part B — browser UX, cross-origin** (11/11): same flow with follower starting on a different origin (`:9124`→`:9123`); userscript re-boots on the new origin (`@match *://*/*`) and rejoins.
> - **⚠️ ONE GAP FOUND (cross-origin, first-time site).** A follower auto-rejoins cross-origin **only if it already has a display name in that origin's `localStorage`**. On a site the user has *never* partied on, `loadStoredName()` returns null → `if (me) connect()` is skipped → the panel mounts and the room hash is present, but it **stalls at the name gate** and does NOT auto-rejoin until the user re-types their name (host is left alone in the room). Same-origin "next episode" and any previously-visited origin are unaffected. Applies to **both** userscript and extension (both read the name from per-origin `localStorage` via [main.ts](../client/userscript/main.ts) `loadStoredName`). Candidate fix (v0.8.7): when an invite/party hash is present but no name is stored, auto-connect with a placeholder/guest name (or the last-known name carried along) and let the user rename inline — keeps the room synced, which is the whole point of follow. See "Open threads" #6.
>
> Remaining = Light-theme eyeball, the cross-origin-fresh-name fix (optional), and the standing open threads below.
>
> **2026-06-21 session (3) — v0.8.6: follow-the-host navigation + Light theme + more adapters.** Three deliverables, all built green (`tsc --noEmit` clean, `npm run build` emits all three targets). (Built on branch `claude/wp-v086`; later merged + released — see session 4 above.)
>
> 1. **Follow-the-host navigation (headline).** New `navigate` wire message ([shared/protocol.ts](../shared/protocol.ts) `NavigateMsg = {from, url, title?, ts}`). The host clicks a new **"Bring everyone here"** button (admin/operators only) in the panel; since the host is *already on the destination*, the broadcast goes over a live socket — sidestepping the "WS dies on nav" problem entirely. Relay ([relay/room.ts](../relay/room.ts)) gates it to **admin + operators only — deliberately NOT freeForAll** (yanking everyone is more disruptive than a seek), re-stamps `from` from `conn.id` (anti-spoof), validates `http(s)` URLs, and broadcasts to everyone but the sender. Followers ([client/userscript/main.ts](../client/userscript/main.ts) `case "navigate"` → `startFollowCountdown`) get a **5s cancelable countdown banner** ("Host moved to X — following in Ns… [Stay here]"); on expiry they `window.location.href` to `roomLinkForUrl(url, roomId, passphrase)` (strips host's hash, re-appends their own `#party=<id>` + key) → new page re-boots, re-joins the same room, resyncs from the relay's `lastState`. Userscript needs no nav change (`@match *://*/*` re-boots anywhere). **Extension gap fixed** ([client/extension/background.ts](../client/extension/background.ts)): an already-activated tab navigating cross-origin previously hit the grace branch and never re-injected even with a `#party=` hash present — added a `hasPartyHash(d.url)` check in the cross-origin `onCommitted` branch that clears the alarm + re-activates on the new origin. Panel UI in [panel.ts](../client/userscript/ui/panel.ts): `onBringEveryone` hook, `cp-bring` button (gated on a new `canDrive` flag threaded through `setState`), and `setFollowBanner`/`hideFollowBanner` methods (reuse the update-banner visual pattern).
> 2. **Light theme (6th preset).** Internal grays now **derive from `--cp-bg`/`--cp-text` via `color-mix`** set in `applyTheme()` — new tokens `--cp-border` (text 16% → bg), `--cp-muted` (55%), `--cp-input-bg` (8%), `--cp-hover` (14%). Every hardcoded gray in panel.ts (`#111`/`#222`/`#333`/`#444`/`#666`/`#777`/`#888`/`#bbb`/`#2a2a2a` borders, hints, input fills, hovers, timestamps, system text) replaced with these vars; the danger "Turn off" button re-derived as red mixed into bg. Because the tokens reference the anchors, they recompute under the high-contrast override too. Added `{ id:"light", bgColor:"#f7f7f8", textColor:"#1a1a1d", accent:"#f97316", accentText:"#ffffff" }` to `THEMES` (brand orange kept; data-driven swatch row renders it automatically). Kept as-is: high-contrast `#000/#fff`, `rgba(0,0,0,*)` overlays (read fine on both surfaces), update-banner blues.
> 3. **3 more site adapters.** Extracted Cineby's native/fixed-pill button logic into a shared `mountLauncherButton()` + `makeStreamingAdapter({host, idSuffix, isWatchPage, candidates})` factory in [site-adapters/index.ts](../client/userscript/site-adapters/index.ts); refactored `cineby.ts` onto it (behavior preserved) and added `netflix.ts`, `disneyplus.ts`, `max.ts`, registered in `SITE_ADAPTERS`. **Selectors are untested guesses** — these will mostly land as the fixed top-right fallback pill until verified on the live sites; the panel controls work regardless.
>
> **Known limitations (intentional for v1):** (a) *Mass-exit room reset* — if host + all followers leave the old page at once the room can briefly empty, resetting `operators`/`passphrase` (room.ts) while `lastState` survives; host usually reconnects first and reclaims admin, and the passphrase rides the followed URL's `key=` hash, so it effectively persists — but operators lose their crown. (b) *No host self-detection* — navigation is a manual "come where I am" button, never auto-detected. **Still owed:** Cineby precise selectors are blocked pending a DOM dump/screenshot of Cineby's header from the user. **CI when merged:** push touches `manifest.json` (→ release), `relay/room.ts` + `shared/protocol.ts` (→ relay redeploy) — watch BOTH; if the relay deploy fails, `navigate` silently no-ops server-side (`gh workflow run deploy.yml --ref main -f force_relay=true`).
>
> **2026-06-21 session (2) — v0.8.5 preset themes.** Added a one-click theme picker to the settings drawer. Five dark presets, each defining `bgColor` + `textColor` + `accent` (+ a precomputed readable `accentText`). Introduced two CSS vars — `--cp-accent` / `--cp-accent-text` — and replaced the hardcoded `#2563eb`/`#f97316` action colors (brand mark, copy/join/key-save/send buttons, active layout-mode pip) so a single token recolors every action surface. New **Theme** section renders five swatches (surface + accent dot + label; active gets an accent ring); a new freeform **Accent** picker sits beside Background/Text. Picking a preset syncs the pickers + ring; nudging any picker clears the ring (→ custom). `accentTextFor()` luma-checks a custom accent and flips button text dark/light for legibility. Migration is automatic — `loadSettings()` spreads over `DEFAULTS`, so existing users land on Midnight (orange); the one visible default change is copy/send buttons going blue→orange (matches the approved Midnight mockup). All in [client/userscript/ui/panel.ts](../client/userscript/ui/panel.ts). `tsc --noEmit` clean; `npm run build` emits all three targets. **Light theme deliberately deferred** — it needs the hardcoded internal grays (`#111` inputs, `#888` hints, `rgba(0,0,0,0.2)` drawer) audited, unlike the near-free dark presets. Adding more presets = one row in the `THEMES` array.
>
> **2026-06-21 session (1) — v0.8.4 shipped (the "buttons + sync are dead" fix).** Three bugs fixed in one patch, all verified:
> 1. **Panel TDZ crash (root cause of everything).** `applyTheme()` runs while the settings drawer is built during `mountPanel()` and calls `rerenderChatColors()`, which reads `chatLog` — but `chatLog` was declared ~250 lines later. The TDZ `ReferenceError` threw mid-mount, *before* the copy/share/chat/reaction click listeners were attached AND before `bootTopFrame()` reached `createSyncClient()` — so every panel button silently did nothing ("can no longer select the copy room link") and sync never started ("not synced like it used to be"). Same class as the v0.8.1 `currentYou` TDZ; `chatLog` was the one missed. Fix: hoist `chatLog` into the early participant-state block. ([client/userscript/ui/panel.ts](../client/userscript/ui/panel.ts))
> 2. **Receiver-side autoplay freeze.** A remote `play` has no user gesture on the viewer's tab, so the browser rejects programmatic `.play()`; the old `.catch(()=>{})` swallowed it and the viewer froze (pause synced, play didn't). Fix: `playWithAutoplayFallback()` — on rejection, mute + retry (muted autoplay is always allowed) to stay in sync, then restore sound on the viewer's next click. Applied in both the top-frame adapter ([main.ts](../client/userscript/main.ts)) and the iframe bridge ([iframe-bridge.ts](../client/userscript/iframe-bridge.ts)). Strictly safe: driver's gesture-backed play never mutes; allowed autoplay never mutes. Closes the long-standing "autoplay mitigation unimplemented" risk.
> 3. **Clipboard hardening.** `navigator.clipboard.writeText` is blocked under `Permissions-Policy: clipboard-write=()` and outside secure contexts. Added `copyToClipboard()` with a hidden-`<textarea>` + `execCommand("copy")` fallback, used by both copy buttons and the site-adapter `copyInviteLink`. Verified in headless Chromium: copy lands the room URL on both normal and policy-blocked pages.
>
> Shipped as commit `232336d` on main (rebased onto the v0.8.3 docs commit `00816a9`, fast-forward push). **Still owed from the v0.8.3 session:** sideload-test on Zen — effectively satisfied now since the user confirmed v0.8.4 working, but a clean `about:debugging` load of `watch-party-firefox-0.8.4.zip` is still worth a final pass.

> **2026-06-18 session — v0.8.3 shipped.** Added Firefox/Zen support and extension icons, released as **v0.8.3** via clean fast-forward of `origin/main` (`cf35fb8` → `e694a63`). CI release run [27787081127](https://github.com/AviouslyAvi/Watch-Party/actions/runs/27787081127) succeeded: built Firefox with prod WS_URL, attached `watch-party-firefox-0.8.3.zip` + `watch-party-0.8.3.zip` + `avious-party.user.js`, tagged v0.8.3. See "What this session shipped" below and the decision record [docs/decisions/2026-06-18-firefox-zen-support-and-icons.md](decisions/2026-06-18-firefox-zen-support-and-icons.md). Also fixed a latent bug: `extension-build/` was missing `background.js` since v0.5.0 (CI never synced it), making the loadable-unpacked Chrome dir non-loadable — now fixed (committed directly in `e694a63`; CI syncs the full set going forward). **Still owed:** sideload-test `dist/extension-firefox/` on Zen.
>
> **Repo-state note (important for next session):** `origin/main` lives on root `ace45ac` (the v0.6.x→v0.8.x lineage). An older **local-only** `main` on an unrelated root (`de2b5c0`, the v0.5.0 lineage) was orphaned — its features (peer-color, dormant/click-to-activate, typing, reactions) all already exist re-implemented on `origin/main`, so the primary worktree's `main` was reset (`git reset --hard origin/main`) rather than pulled (a plain pull errors on unrelated histories). If you see a stale `main` at v0.5.0 again in any worktree, reset it to `origin/main`; do not try to merge the two roots.

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

### v0.8.3 — Firefox/Zen support + icons (SHIPPED — live on main)

Shipped as a patch (small additive feature). Lockstep version bump applied to `client/extension/manifest.json` and `client/userscript/banner.txt` → `0.8.3`.

- **Firefox/Zen build target.** New `TARGET=firefox` / `npm run build:firefox` in [build.mjs](build.mjs) emits `dist/extension-firefox/` from the **same** `background.ts` / `content.ts`. Two build-time deltas only: (1) manifest transform — `background.service_worker` → `background.scripts`, plus `browser_specific_settings.gecko` (id `watch-party@avious.party`, `strict_min_version: 115.0` — the floor for `storage.session`); (2) a one-line esbuild banner `var chrome=globalThis.browser||globalThis.chrome;` applied only to the Gecko bundles, aliasing the `chrome` namespace to Gecko's promise-based `browser`. The alarms-based teardown design already assumed an unloadable background context, so it ports to an event page unchanged. `firefox` is included in the default `all` target; CI's `build:ext`/`build:user` calls are untouched. Decision record: [docs/decisions/2026-06-18-firefox-zen-support-and-icons.md](decisions/2026-06-18-firefox-zen-support-and-icons.md).
- **Real extension icons.** `client/extension/icons/icon.svg` (orange rounded square + white play triangle, matching the `#f97316` ON badge). `gen-icons.mjs` rasterizes to 16/32/48/128 PNGs via `sharp`; PNGs committed so normal builds don't need `sharp`. Wired into `manifest.json` `icons` + `action.default_icon`. Replaces the Chrome puzzle-piece. (Closes the old "Logo design" next-step.) Remaining optional polish: swap active/inactive icon via `chrome.action.setIcon({ tabId, ... })` instead of the "ON" badge-text indicator.
- **CI: Firefox zip + `extension-build/` fix.** [.github/workflows/deploy.yml](.github/workflows/deploy.yml) `extension-release` job now also runs `build:firefox`, attaches `watch-party-firefox-<ver>.zip` to the release, and syncs the **full** `extension-build/` set (content.js, **background.js**, manifest.json, icons/). Fixes a latent bug: `background.js` had never been synced there since the v0.5.0 dormant refactor, so the loadable-unpacked Chrome dir was non-loadable. `extension-build/` repopulated on this branch with a prod-WS build.

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

> ✅ **DONE (session 4):** (a) v0.8.6 merged ([PR #6](https://github.com/AviouslyAvi/Watch-Party/pull/6)), released, relay redeployed clean — `navigate` is live server-side. (b) Follow test run via automated harness — **33/33** (v0.8.6) + **16/16** (v0.8.7 re-test). (c) Primary `main` working tree reset to origin/main. (d) Light theme eyeballed — legible + high-contrast overrides. (e) v0.8.7 fix for the cross-origin name-gate gap **built + verified** (Open thread #6 resolved).

1. **MERGE [PR #7](https://github.com/AviouslyAvi/Watch-Party/pull/7) to ship v0.8.7.** Already committed + pushed on `claude/great-pike-0ea82e`; PR is open, typecheck green, MERGEABLE/CLEAN. **The merge was blocked by the auto-mode classifier** (Avi authorized "push & open PR" but not the merge) — so it needs Avi's explicit go-ahead, or Avi merges it in the GitHub UI. On merge the manifest bump cuts the `v0.8.7` release (Chrome + Firefox zips + userscript). **No relay/shared changes this time** → relay does NOT redeploy (the `navigate` server handler is unchanged from v0.8.6). Just watch the `extension-release` job + confirm the v0.8.7 release assets.
2. **(optional) Manual two-client confirm.** Automated 16/16 already covers it against the live relay, but a human spot-check in two real browser profiles never hurts — load the v0.8.7 userscript, party on site X, follow the host to a brand-new site Y you've never used, confirm you land synced without re-typing your name.

**Whatever ships next**: bump as a patch (`v0.8.8`), not a minor. See "Versioning convention" above.

Open threads to pick from after smoke is clean:

1. **Tighten Cineby selectors (STILL BLOCKED — needs user input).** The adapter (now built on the shared `makeStreamingAdapter` factory) uses a defensive candidate-selector list and falls back to a top-right fixed pill. **Provide a screenshot or DOM dump of Cineby's header** to swap in a precise selector so the button lands natively.
2. **Verify/tighten the new adapter selectors (Netflix/Disney+/Max).** Added in v0.8.6 but the selectors are untested guesses — they currently land as the fixed-pill fallback. Confirm on each live site and replace `candidates` with real anchors. Also still open: Hulu, Crunchyroll, Twitch.
3. **Chrome Web Store listing.** Real one-click install path. Blockers: ~200 words store copy, privacy policy stub hosted on the landing, $5 dev account fee, ~3-day review. (Logo done in v0.8.3.)
4. **Service-worker WS migration** so cross-domain navigation can carry the live socket (not just session state). Today the WS dies with the page on nav; the SW grace window restores activation state but the socket reconnects. (Follow-the-host now re-joins cleanly via the room hash, so this is lower priority — it would only save the reconnect blip.)
5. **Additional settings ideas** flagged but not built: sound on chat, vanity room name, message-level reactions, keyboard shortcuts (`chrome.commands`), typing-privacy toggle.
6. ~~**Cross-origin first-time follow stalls at the name gate.**~~ ✅ **FIXED in v0.8.7** (built + verified, pending merge — see the v0.8.7 note at top). The follower now carries its display name in the follow URL hash; the destination adopts + persists it and auto-rejoins. Verified 16/16 against the live relay.

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
- **Forced-navigation / yank attempt (v0.8.6):** server `case "navigate"` admits only admin + operators (NOT freeForAll), re-stamps `from` from `conn.id`, and rejects non-`http(s)` URLs — a non-driver's `navigate` is silently dropped. Followers also apply a 5s cancelable countdown, so even a legit nav is interruptible.

---

## Resume prompt (paste into a fresh chat)

```text
Continue work on the Watch-Party extension.

Before doing anything, read docs/HANDOFF.md — it has the full status. Briefly:
v0.8.6 is SHIPPED (merged via PR #6, released, relay redeployed clean — the
`navigate` follow-the-host handler is LIVE). v0.8.7 is committed + pushed and
PR #7 is OPEN + green (typecheck pass, mergeable) but NOT yet merged — the
auto-mode classifier blocked the merge since I only authorized push+PR. It's a
client-only fix in client/userscript/main.ts that makes a first-time
cross-origin follower carry its display name in the follow URL hash and
auto-rejoin instead of stalling at the name gate. Verified 16/16 against the
live relay; Light theme also eyeballed (legible + high-contrast overrides).
IMMEDIATE NEXT STEP: confirm whether PR #7 should be merged — if yes, merge it
and watch ONLY the extension-release job (no relay/shared change → no relay
redeploy), then confirm the v0.8.7 release assets.

VERSIONING: patch bumps only (v0.8.7 is current; next is v0.8.8). Do not bump
minor or major unless I explicitly say so. Don't rewind versions — Tampermonkey
treats lower as a downgrade and refuses to update.

Open threads (all need me or my input): Cineby precise selectors (BLOCKED on a
DOM dump from me), verify the Netflix/Disney+/Max adapter selectors on live
sites (currently fixed-pill fallback), Chrome Web Store listing.
```
