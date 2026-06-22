# Watch-Party

Teleparty-style synchronized watch party for **any site with a video player**. Ships as an MV3 browser extension (Chrome + Firefox/Zen, primary) and a Tampermonkey userscript (legacy), backed by a Cloudflare Worker + Durable Object relay.

## What you get

- Play / pause / seek sync between everyone in a room.
- **Follow-the-host navigation** — the host (admin or a promoted operator) clicks **📍 Bring everyone here** and everyone else gets a 5-second cancelable countdown banner ("Host moved to X — following in Ns… [Stay here]") before auto-following to the host's page and re-joining the same room. Works across origins and survives "next episode" SPA navigations; a follower keeps its display name when it lands on a brand-new site.
- Admin model: first joiner is admin. Admin can flip a **Free-for-all controls** switch — when off, only admin (and promoted operators) drive playback (viewers' attempts snap back). When on, anyone can. (Follow-the-host stays admin/operator-only even in free-for-all — yanking everyone is more disruptive than a seek.)
- Right-edge sidebar with text chat, emoji reactions, participant list, room link copy, onboarding-link copy for non-installers, optional room passphrase, and an in-app update banner when a new version ships.
- **Themeable panel** — a settings drawer (⚙) with six one-click preset color themes (Midnight, Cinema, Synthwave, Forest, Ocean, and a Light theme), a custom accent/background/text picker, opacity and text-size sliders, a colorblind-safe palette, a high-contrast toggle, and a replayable onboarding tour.
- **Site launcher buttons** — on supported streaming sites a "🎬 Watch-Party" button slots into the page chrome (or a fixed top-right pill as fallback) so you can start a party in one click.
- 128-bit room IDs and optional out-of-band passphrase — random scanners can't guess into your room.
- Native player controls (source switcher, subtitles, quality) stay fully functional.

### Supported sites

The sync engine works on **any page with a `<video>` element**. On top of that, these sites get a dedicated one-click launcher button:

| Site | Anchor status |
| --- | --- |
| YouTube | Inline button next to **Share** in the watch-page actions row. |
| Cineby | Best-effort header anchor; falls back to the top-right pill. |
| Netflix | Best-effort player-chrome anchor; usually the top-right fallback pill. |
| Disney+ | Best-effort player-chrome anchor; usually the top-right fallback pill. |
| Max (HBO Max) | Best-effort player-chrome anchor; usually the top-right fallback pill. |

Netflix, Disney+, and Max selectors are untested guesses today and typically render as the fixed top-right pill rather than an inline button — the party still works either way.

## Install (users)

The extension is distributed as an unpacked MV3 folder. It's prebuilt and wired to the production relay — no build step needed.

1. Download or clone the [`extension-build/`](./extension-build/) folder from this repo.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select `extension-build/`.
5. Pin it from the puzzle-piece menu — it now ships with a real toolbar icon (orange play badge), no more puzzle-piece default.

See [`extension-build/README.md`](./extension-build/README.md) for the user-facing install/update guide.

### Firefox / Zen

The extension also builds for Firefox and Firefox forks like Zen (Gecko MV3). The release attaches a `watch-party-firefox-<ver>.zip` alongside the Chrome zip; sideload it via `about:debugging` → **This Firefox** → **Load Temporary Add-on** (note: temporary add-ons clear on browser restart, and Gecko may prompt for host-permission grants on first activation per site). An AMO listing is not published yet.

### Use

1. Open any page with a `<video>` element.
2. The Watch-Party sidebar appears on the right edge. Enter a display name → **Join chat**.
3. Click **Copy room link** and send it to a friend who already has the extension → instant party.
4. Friend doesn't have it installed? Click **Copy onboarding link** instead — the link routes them through the landing page with install steps first, then forwards them into your party automatically once the extension is detected.
5. Want everyone to follow you to a different page (or next episode)? Click **📍 Bring everyone here** — they get a 5-second countdown and auto-follow (or click **Stay here** to opt out).
6. Admin-only: click **🔒 Add room key** to set an out-of-band passphrase. Friends need both the new link and the key (sent separately) to join. Empty rooms reset the key.

### Updating

Unpacked extensions don't auto-update. The sidebar shows an update banner when a new version is available; pull the latest `extension-build/` and click the reload icon on `chrome://extensions`.

### Userscript (legacy)

The Tampermonkey userscript path still works for users who prefer it. Install Tampermonkey, then install `dist/avious-party.user.js` from a release. The extension is the recommended path.

## Develop

```bash
npm install
npm run dev:relay                              # ws://localhost:8787
WS_URL=ws://localhost:8787 npm run build       # → dist/avious-party.user.js + dist/extension/ + dist/extension-firefox/
npm run build:ext                              # Chrome MV3 extension only
npm run build:firefox                          # Firefox/Zen (Gecko MV3) extension only
npm run build:user                             # userscript only
npm run typecheck                              # tsc --noEmit
```

For the Chrome extension, point Chrome at `dist/extension/` via **Load unpacked**. For Firefox/Zen, load `dist/extension-firefox/` as a temporary add-on via `about:debugging`. For the userscript, paste `dist/avious-party.user.js` into Tampermonkey's editor.

The Firefox target is produced from the **same** `background.ts` / `content.ts` as Chrome — `build.mjs` rewrites the manifest (`background.service_worker` → `background.scripts`, adds `browser_specific_settings.gecko`) and prepends a one-line `var chrome = globalThis.browser || globalThis.chrome;` namespace shim. No forked source.

## Deploy

```bash
npm run deploy:relay                                            # → wss://avious-party-relay.<account>.workers.dev
WS_URL=wss://avious-party-relay.<account>.workers.dev \
  npm run build:ext                                             # rebuild extension against prod relay
cp dist/extension/* extension-build/                            # promote to distribution folder, commit
npm run deploy:landing                                          # → Cloudflare Pages
```

The production relay currently runs at `wss://avious-party-relay.avibenabram.workers.dev`. Never bake `WS_URL` into committed source — pass it through build env, and only the prebuilt `extension-build/` should carry it. CI (`.github/workflows/deploy.yml`) attaches all three release assets (`avious-party.user.js`, the Chrome zip, and the Firefox zip) and redeploys the relay/landing only when their sources change.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the full workspace map and per-workspace `CONTEXT.md` files. TL;DR:

- `shared/` — pure sync engine + protocol types (incl. the `navigate` follow-the-host message). No DOM, no network.
- `client/extension/` — MV3 extension (v2, primary). Chrome + Firefox/Zen from one source; `icons/` holds the SVG source + rasterized PNGs.
- `client/userscript/` — Tampermonkey wrapper (v1, legacy), including `ui/panel.ts` (themeable sidebar) and `site-adapters/` (per-site launcher buttons).
- `relay/` — Cloudflare Worker + Durable Object, one room per session. Gates `navigate` to admin + operators.
- `landing/` — static onboarding site on Cloudflare Pages, points users at the extension folder.
- `extension-build/` — committed prebuilt extension wired to the production relay; what users load unpacked.
- `docs/` — decisions, research, active `HANDOFF.md`.

## Changelog

_Changelog through v0.8.7 (current). See the [GitHub releases](https://github.com/AviouslyAvi/Watch-Party/releases) for full per-release assets._

### v0.8.7 — Cross-origin follow name-carry fix (2026-06-21)

- A first-time cross-origin follower now carries its display name in the follow URL hash and auto-rejoins, instead of stalling at the name gate on a site it has never partied on. The destination adopts + persists the name to that origin's `localStorage`, then strips the one-shot param. Verified 16/16 against the live relay.

### v0.8.6 — Follow-the-host + Light theme + more adapters (2026-06-21)

- **Follow-the-host navigation (headline).** New `navigate` wire message; host clicks **📍 Bring everyone here** (admin/operators only, deliberately not free-for-all), followers get a 5s cancelable countdown banner and auto-follow to the host's page, re-joining the same room and resyncing. Verified via automated harness (33/33 assertions, incl. cross-origin + [Stay here] cancel).
- **Light theme** — sixth preset. Internal grays now derive from the surface/text tokens via `color-mix`, so a light surface stays legible (and the high-contrast override still works).
- Three more site adapters: **Netflix**, **Disney+**, and **Max (HBO Max)** (best-effort selectors; land as the fallback pill until tightened).

### v0.8.5 — Preset color themes (2026-06-21)

- One-click **theme picker** in the settings drawer with five dark presets (Midnight, Cinema, Synthwave, Forest, Ocean), each defining surface + text + accent. New `--cp-accent` / `--cp-accent-text` tokens recolor every action surface from a single value; a freeform **Accent** picker with automatic dark/light button-text contrast sits beside the Background/Text pickers.

### v0.8.4 — Panel + sync crash fixes (2026-06-21)

- Fixed a panel TDZ `ReferenceError` (`chatLog` referenced before declaration) that threw mid-mount, silently breaking every panel button and preventing sync from starting. Plus autoplay-blocked receiver fixes.

### v0.8.3 — Firefox/Zen support + extension icons (2026-06-18)

- Added a third build target (`npm run build:firefox`) emitting a Gecko MV3 build from the same source via a build-time manifest transform + a one-line `browser`/`chrome` namespace shim, so the extension installs on Firefox and Zen.
- Real extension icon (orange rounded square + white play triangle) rasterized to 16/32/48/128 PNGs; replaces Chrome's puzzle-piece default. Also fixed `extension-build/` missing `background.js` since the v0.5.0 refactor. See [docs/decisions/2026-06-18-firefox-zen-support-and-icons.md](docs/decisions/2026-06-18-firefox-zen-support-and-icons.md).

### v0.3.0 — Room hardening (2026-05-16)

- `cbe2e27` v0.3.0: rebuild extension with room hardening (passphrase + 128-bit IDs).
- `58ba6b2` Harden rooms: 128-bit room IDs (22-char base64url tokens) + optional passphrase gate. Relay pins the passphrase on first connection; mismatched joiners get a `4001` close with a "Wrong room key" banner. Empty rooms reset the pin so admins can change or clear the key.

### v0.2.x — CI/CD + distribution

- `bcaafc2` docs: update CI/CD handoff to shipped state.
- `e56ef06` ci: GitHub Actions workflows for typecheck + Cloudflare deploy.
- `063685d` README: lead with extension install, demote userscript to legacy.
- `d8f0b24` Document v0.2.0 ship + Cloudflare deploy + distribution decisions.
- `4e9c6f1` Add handoff for GitHub Actions CI/CD setup.
- `b666895` Landing: switch to extension distribution, rename Pages project.

### v0.2.0 — MV3 extension (shipped)

- `bb5f6d4` v0.2.0: in-extension update banner.
- `8ef0134` Wire `extension-build/` to production relay.
- `ff4eee2` Replace `prompt()` with in-panel name gate.
- `67a3e10` Add prebuilt extension under `extension-build/`.
- `9aadac9` Convert floating panel into right-edge sidebar.

### Foundation

- `670acda` Add AGPL-3.0 license.
- `8254b4f` chore: gitignore secrets and env files.
- `62e5bcb` docs: three-layer routing system (`CLAUDE.md` router + per-workspace `CONTEXT.md`).

## Roadmap

- Verify/tighten the new Netflix / Disney+ / Max adapter selectors against the live sites (they currently land as the fallback pill), plus a Cineby header DOM dump. Then add Hulu, Crunchyroll, Twitch.
- Chrome Web Store + AMO (Firefox) listings for a one-click install path.
- Service-worker WS to survive SPA episode changes (lower priority now that follow-the-host re-joins cleanly via the room hash).
- Wrangler v4 upgrade.
- Shared cursor and other reaction polish.

## Caveats

The extension uses `all_frames: true` + `match_about_blank: true` so the content script reaches cross-origin player iframes (where the `<video>` element often lives). A runtime check decides whether to mount the sidebar (top frame) or run the iframe bridge. If a stream provider blocks the content script via CSP, that source won't work — switch source in the player if the site offers one. On Firefox/Zen, Gecko treats `<all_urls>` as opt-in host permissions, so the first activation on a new site may require a user grant.
