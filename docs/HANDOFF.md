# Watch-Party — Handoff

Last updated: 2026-05-17
Milestone: **v0.4.1 shipped — typing indicator live in prod (client + relay)**

## Status

v0.4.1 (typing indicator) is live: [PR #3](https://github.com/AviouslyAvi/Watch-Party/pull/3) squash-merged as `48108f8`, [v0.4.1 release](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.1) auto-cut by CI, **relay redeployed with the `case "typing"` broadcast handler.** Receiver-side decay model (1.5s send throttle, 3s per-sender decay). Three-profile Playwright smoke was 7/7 green pre-merge.

v0.4.0 emoji reactions remain live on top of v0.4.1. Existing Tampermonkey users see the auto-update banner on next page reload; extension users need to reload-from-unpacked or refresh from the new zip.

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What this session shipped

- **v0.4.1 cut and fully deployed.** Typing indicator: protocol addition `TypingMsg` (no `until` field — receiver-side decay), relay broadcasts unrated (server rewrites `from`/`name` from trusted `conn`). Panel renders `#cp-typing` above `#cp-form`: 1.5s send throttle on `input` events; receiver keeps `Map<ClientId, {name, timeoutId}>` with 3s decay per sender. Render rules: 0→hidden, 1→"X is typing…", 2→"X and Y are typing…", 3+→"Several people are typing…". Beyond-spec: chat arrival clears that sender's typing indicator immediately. Squash-merged via [PR #3](https://github.com/AviouslyAvi/Watch-Party/pull/3) as `48108f8`. CI auto-cut [v0.4.1 release](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.1).
- **CI hardening: Node 22 pin + manual-dispatch lever.** Wrangler v4's first real exercise on the v0.4.1 merge failed — runner default Node 20, Wrangler v4 requires ≥22, `cloudflare/wrangler-action@v4` doesn't pin Node itself. Added `actions/setup-node@v4` with `node-version: 22` to both `landing` and `relay` jobs in `.github/workflows/deploy.yml`. Also added `workflow_dispatch` with `force_relay` / `force_landing` inputs so we can redeploy on-demand without no-op commits. Used `force_relay=true` to redeploy the relay with the typing handler (path filter skipped relay on the .github-only fix commit).

## What earlier sessions shipped (kept for context)

- **v0.4.0 release.** Emoji reactions merged via [PR #2](https://github.com/AviouslyAvi/Watch-Party/pull/2) (squash `62d49c3`). Six-emoji bar (❤️ 😂 🔥 👏 😮 👀) below chat; click broadcasts `ReactionMsg`; all peers see the emoji rise above chat with sender's name, fades after ~2s. DOM-cap 5 simultaneous floats; relay rate-limits 5 reactions / 10s per conn; server-side emoji allowlist drops anything off-list silently. 17/17 Playwright smoke green.
- **v0.3.1 release.** Bumped manifest + banner. CI rebuilt extension, zipped, published [Watch-Party v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1).
- **Landing deep-link helper live.** Userscript panel has "Copy onboarding link" button. Landing parses `v/party/key` fragment, shows invited hero, auto-forwards when extension marker present.
- **Wrangler 3 → 4.92.0 upgrade landed on main.** CI path-filtered.
- **v0.3.0 room hardening.** 128-bit room IDs, optional passphrase (`&key=`), rejection banner for wrong-key clients.

Commits on `main` (most recent first):
- `48108f8` — feat: typing indicator (v0.4.1) (#3)
- `1849fae` — ci: bump cloudflare/wrangler-action v3 → v4 for wrangler v4 support
- `62d49c3` — feat: emoji reactions (#2)

Plus CI follow-ups on `main` after the merge: Node 22 pin for landing+relay, and `workflow_dispatch` (`force_relay` / `force_landing`).

Releases: [v0.4.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.1) · [v0.4.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.0) · [v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1) · [v0.3.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.0)

## Threat model in plain terms

- **Random scanner hitting your relay URL** with a guessed room: blocked by entropy. 128-bit search space.
- **Friend forwards your full URL to someone you didn't intend:** still in. Same as before. Use a passphrase if this matters.
- **You want OOB protection:** click "🔒 Add room key" in the panel as admin, set a value, copy the new link. Tell friends the key separately (voice/text). URL alone is no longer enough.
- **Someone spams reactions to grief:** capped at 5 per 10s per connection at the relay; excess silently dropped. Custom-emoji injection blocked by server-side allowlist.
- **Someone spams typing events to grief:** server rewrites `from`/`name` from trusted conn so identity-spoofing is blocked; floor message volume is bounded by client throttle but a hostile client could flood. If abuse appears, add a relay rate-limit similar to reactions (parked).

## Exact next step

1. **Eyeball v0.4.1 typing in two real profiles for 60s in prod.** Both must reload from the v0.4.1 zip first (extension users) or wait for the userscript auto-update banner (Tampermonkey). Type in Profile A → confirm "Avi is typing…" appears in Profile B within ~1.5s and clears within ~3s of stopping. Validates that the client throttle / receiver decay feel right in real conversation, not just smoke.

Pick one after:

2. **Manual smoke on prod for v0.3.1 onboarding flow** (still owed). Two profiles: Profile A clicks "Copy onboarding link", Profile B pastes → invited hero → install → auto-forward. Bonus: broken fragment fallback, mid-countdown cancel.
3. **Eyeball v0.4.0 reactions float feel** in two real profiles — still parked from last session.
4. **Icon design.** Chrome still shows the puzzle-piece icon for the extension.
5. **Service-worker WS migration** so SPA episode navigation doesn't drop the room (Cineby etc.).
6. **Peer-color hash** (deterministic color per ClientId). Pure client-side cosmetic, no protocol change — could pair nicely with typing for legibility ("Avi is typing…" colored to match their chat name).

## Open decisions

- Whether to surface the passphrase UI to non-admins as a read-only "🔒 This room is keyed" indicator, or keep it admin-only and invisible to others (current).

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on the receiver if they haven't clicked the page. Mitigation idea: mute-first-then-unmute on receiver's initial sync (unimplemented).
- CSP-locked stream providers on Cineby still won't accept the content script; user works around it by switching source.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- CI's `deploy.yml` is load-bearing: auto-cuts a GitHub release whenever `client/extension/manifest.json` changes, auto-deploys the landing page whenever `landing/**` changes. Don't bump the manifest version casually — it will publish.
- Relay deploy is gated on `relay/**` or `shared/**` changes. Safe to push client-only changes without republishing the relay. If a merge bumps the manifest **and** touches `shared/`/`relay/` (like v0.4.1 did), the relay deploy must succeed too — otherwise the client ships ahead of the server and features silently no-op. Use `gh workflow run deploy.yml --ref main -f force_relay=true` to redeploy on-demand.
- ✅ Wrangler v4 is now exercised in CI on Node 22 (confirmed live by the force_relay run on `48108f8`-era main). Both `landing` and `relay` jobs pin Node 22 explicitly.
