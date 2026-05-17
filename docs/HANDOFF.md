# Watch-Party — Handoff

Last updated: 2026-05-17
Milestone: **v0.4.1 shipped — typing indicator live in prod**

## Status

v0.4.1 is live. Typing indicator merged via [PR #3](https://github.com/AviouslyAvi/Watch-Party/pull/3) (squash `48108f8`). CI's `extension-release` job auto-cut the GitHub release on manifest version change. Existing Tampermonkey users see the auto-update banner on next page reload; extension users need to reload-from-unpacked or refresh from the new zip.

v0.4.0 emoji reactions remain live on top of v0.4.1.

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What this session shipped

- **v0.4.1 cut.** Typing indicator merged via [PR #3](https://github.com/AviouslyAvi/Watch-Party/pull/3) (squash `48108f8`). Protocol addition `TypingMsg` (no `until` field — receiver-side decay); relay broadcasts unrated (no limit, no allowlist — server rewrites `from`/`name` from trusted `conn`). Panel renders `#cp-typing` above `#cp-form`: client-side 1.5s send throttle on `input` events, receiver maintains `Map<ClientId, {name, timeoutId}>` with 3s decay per sender. Render rules: 0→hidden, 1→"X is typing…", 2→"X and Y are typing…", 3+→"Several people are typing…". Beyond-spec: chat arrival clears that sender's typing indicator immediately.
- **Three-profile Playwright smoke — 7/7 green** before merge (typing visible <1.5s, decay ~3.5s, three-peer join, ~4 frames over 5s confirms throttle, chat + reactions intact, no console errors).

## What earlier sessions shipped (kept for context)

- **v0.4.0 release.** Emoji reactions merged via [PR #2](https://github.com/AviouslyAvi/Watch-Party/pull/2) (squash `62d49c3`). Six-emoji bar (❤️ 😂 🔥 👏 😮 👀) below chat; click broadcasts `ReactionMsg`; all peers see the emoji rise above chat with sender's name, fades after ~2s. DOM-cap 5 simultaneous floats; relay rate-limits 5 reactions / 10s per conn; server-side emoji allowlist drops anything off-list silently. 17/17 Playwright smoke green.
- **v0.3.1 release.** Bumped manifest + banner. CI rebuilt extension, zipped, published [Watch-Party v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1).
- **Landing deep-link helper live.** Userscript panel has "Copy onboarding link" button. Landing parses `v/party/key` fragment, shows invited hero, auto-forwards when extension marker present.
- **Wrangler 3 → 4.92.0 upgrade landed on main.** CI path-filtered.
- **v0.3.0 room hardening.** 128-bit room IDs, optional passphrase (`&key=`), rejection banner for wrong-key clients.

Commits on `main` (most recent first):
- `48108f8` — feat: typing indicator (v0.4.1) (#3)
- `1849fae` — ci: bump cloudflare/wrangler-action v3 → v4
- `5219136` — ci: sync extension-build/ for v0.4.0 [skip ci]
- `19127ac` — v0.4.0: emoji reactions
- `62d49c3` — feat: emoji reactions (#2)
- `7003da5` — chore: upgrade wrangler 3.114.17 → 4.92.0

Releases: [v0.4.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.1) · [v0.4.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.0) · [v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1) · [v0.3.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.0)

## Threat model in plain terms

- **Random scanner hitting your relay URL** with a guessed room: blocked by entropy. 128-bit search space.
- **Friend forwards your full URL to someone you didn't intend:** still in. Same as before. Use a passphrase if this matters.
- **You want OOB protection:** click "🔒 Add room key" in the panel as admin, set a value, copy the new link. Tell friends the key separately (voice/text). URL alone is no longer enough.
- **Someone spams reactions to grief:** capped at 5 per 10s per connection at the relay; excess silently dropped. Custom-emoji injection blocked by server-side allowlist.
- **Someone spams typing events to grief:** server rewrites `from`/`name` from trusted conn so identity-spoofing is blocked; floor message volume is bounded by client throttle but a hostile client could flood. If abuse appears, add a relay rate-limit similar to reactions (parked).

## Exact next step

Pick one when next session opens:

1. **Eyeball v0.4.0 reactions + v0.4.1 typing indicator in two real profiles for 60s.** Validate the float animation feel and the typing-indicator UX (does 1.5s throttle / 3s decay feel right in real conversation, not just smoke). If anything feels off, tune `REACTION_FLOAT_MS`, the `@keyframes cp-float-up` curve, or the typing constants in `panel.ts` / `main.ts`.
2. **Manual smoke on prod for v0.3.1 onboarding flow** (still owed). Two profiles: Profile A clicks "Copy onboarding link", Profile B pastes → invited hero → install → auto-forward. Bonus: broken fragment fallback, mid-countdown cancel.
3. **Peer-color hash** (deterministic color per ClientId). Pure client-side cosmetic, no protocol change. Pairs well with typing indicator and chat sender labels.
4. **Icon design.** Chrome still shows the puzzle-piece icon for the extension.
5. **Service-worker WS migration** so SPA episode navigation doesn't drop the room (Cineby etc.).

## Open decisions

- Whether to surface the passphrase UI to non-admins as a read-only "🔒 This room is keyed" indicator, or keep it admin-only and invisible to others (current).

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on the receiver if they haven't clicked the page. Mitigation idea: mute-first-then-unmute on receiver's initial sync (unimplemented).
- CSP-locked stream providers on Cineby still won't accept the content script; user works around it by switching source.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- CI's `deploy.yml` is load-bearing: auto-cuts a GitHub release whenever `client/extension/manifest.json` changes, auto-deploys the landing page whenever `landing/**` changes. Don't bump the manifest version casually — it will publish.
- Relay deploy is gated on `relay/**` or `shared/**` changes. Safe to push client-only changes without republishing the relay.
- Wrangler v4 has not yet exercised in CI on a real workload (path filters skipped it on the last few pushes). First exercise will be the next `relay/**` or `landing/**` change.
