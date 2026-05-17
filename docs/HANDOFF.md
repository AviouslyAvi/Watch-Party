# Watch-Party — Handoff

Last updated: 2026-05-16
Milestone: **v0.4.0 shipped — emoji reactions live in prod**

## Status

v0.4.0 is live. Existing v0.3.1 Tampermonkey users see the auto-update banner on next page reload. Extension users need to reload-from-unpacked or refresh from the new zip — there's no auto-update channel.

The orphan branch `claude/vigorous-nightingale-217085` (commit `7003da5`, already on main) is **deleted** from local + origin. Tree is clean.

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What this session shipped

- **v0.4.0 cut.** Emoji reactions feature merged via [PR #2](https://github.com/AviouslyAvi/Watch-Party/pull/2) (squash `62d49c3`). Manifest + banner bumped on main; CI's `extension-release` job auto-cut the GitHub release. Reactions: six-emoji bar (❤️ 😂 🔥 👏 😮 👀) below chat, click broadcasts a `ReactionMsg`, all peers see the emoji rise above chat with sender's name, fades after ~2s. DOM-cap 5 simultaneous floats; relay rate-limits 5 reactions / 10s per conn; server-side emoji allowlist drops anything off-list silently.
- **Two-profile Playwright smoke — 17/17 green.** Validated: bidirectional float render for all five primary emojis with correct sender labels, both connections survive a 10-click spam without disconnect, raw `ws.send({emoji:"💣"})` is dropped by relay (never rendered on the other peer), no console errors, chat round-trip still works alongside. Smoke script + tmp worktree torn down.
- **Orphan branch cleaned up.** `claude/vigorous-nightingale-217085` deleted local + origin.
- **Typing indicator queued.** Next presence primitive. Scope note at [docs/decisions/2026-05-16-typing-indicator.md](decisions/2026-05-16-typing-indicator.md) covers protocol addition (`TypingMsg`, no rate limit, client-side 1.5s send throttle, receiver-side 3s decay), files touched, and the one open question (throttle-vs-decay ratio).

## What earlier sessions shipped (kept for context)

- **v0.3.1 release.** Bumped manifest + banner. CI rebuilt extension, zipped, published [Watch-Party v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1).
- **Landing deep-link helper live.** Userscript panel has "Copy onboarding link" button. Landing parses `v/party/key` fragment, shows invited hero, auto-forwards when extension marker present.
- **Wrangler 3 → 4.92.0 upgrade landed on main.** CI path-filtered, will first exercise on the next `relay/**` or `landing/**` change.
- **v0.3.0 room hardening.** 128-bit room IDs, optional passphrase (`&key=`), rejection banner for wrong-key clients.

Commits on `main` (most recent first):
- `62d49c3` — feat: emoji reactions (#2)
- `7003da5` — chore: upgrade wrangler 3.114.17 → 4.92.0
- `9bbe73f` — v0.3.1: ship landing deep-link helper + Copy onboarding link button

Releases: [v0.4.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.4.0) · [v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1) · [v0.3.0](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.0)

## Threat model in plain terms

- **Random scanner hitting your relay URL** with a guessed room: blocked by entropy. 128-bit search space.
- **Friend forwards your full URL to someone you didn't intend:** still in. Same as before. Use a passphrase if this matters.
- **You want OOB protection:** click "🔒 Add room key" in the panel as admin, set a value, copy the new link. Tell friends the key separately (voice/text). URL alone is no longer enough.
- **Someone spams reactions to grief:** capped at 5 per 10s per connection at the relay; excess silently dropped. Custom-emoji injection blocked by server-side allowlist.

## Exact next step

Pick one when next session opens:

1. **Implement typing indicator** per [decisions/2026-05-16-typing-indicator.md](decisions/2026-05-16-typing-indicator.md). Protocol + relay + panel + main.ts wiring + a Playwright smoke (one peer types, the other sees "X is typing…" appear within 200ms and decay 3s after silence). Bump to v0.4.1 on ship.
2. **Eyeball v0.4.0 reactions in two real profiles for 60s.** Validate the float animation feel (timing, offset jitter, fade curve) that headless can't judge. If anything feels off, tune `REACTION_FLOAT_MS` or the `@keyframes cp-float-up` curve.
3. **Manual smoke on prod for v0.3.1 onboarding flow** (still owed from earlier session). Two profiles: Profile A clicks "Copy onboarding link", Profile B pastes → invited hero → install → auto-forward. Bonus: broken fragment fallback, mid-countdown cancel.
4. **Icon design.** Chrome still shows the puzzle-piece icon for the extension.
5. **Service-worker WS migration** so SPA episode navigation doesn't drop the room (Cineby etc.).

## Open decisions

- Whether to surface the passphrase UI to non-admins as a read-only "🔒 This room is keyed" indicator, or keep it admin-only and invisible to others (current).
- Peer-color hash (deterministic color per ClientId) is parked — could land alongside or after typing indicator with no protocol change. Pure client-side cosmetic.

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on the receiver if they haven't clicked the page. Mitigation idea: mute-first-then-unmute on receiver's initial sync (unimplemented).
- CSP-locked stream providers on Cineby still won't accept the content script; user works around it by switching source.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- CI's `deploy.yml` is load-bearing: auto-cuts a GitHub release whenever `client/extension/manifest.json` changes, auto-deploys the landing page whenever `landing/**` changes. Don't bump the manifest version casually — it will publish.
- Relay deploy is gated on `relay/**` or `shared/**` changes. Safe to push client-only changes without republishing the relay.
- Wrangler v4 has not yet exercised in CI on a real workload (path filters skipped it on the last few pushes). First exercise will be the next `relay/**` or `landing/**` change.
