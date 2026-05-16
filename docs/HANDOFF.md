# Watch-Party — Handoff

Last updated: 2026-05-16
Milestone: **v0.3.0 shipped + landing deep-link helper merged to main**

## Status

v0.3.0 is live. Relay redeployed; extension released as a GitHub Releases zip. Landing deep-link helper (handoff item 3) merged to main as [f081741](https://github.com/AviouslyAvi/Watch-Party/commit/f081741) — not yet redeployed to Pages, and not yet cut as a tagged extension release.

### Landing deep-link helper — what's on main, not yet deployed

- Userscript panel now has a **"Copy onboarding link"** button under "Copy room link". It generates `https://watch-party.pages.dev/#v=<base64url(video-url)>&party=<id>&key=<pass>` — routes non-installers through the landing page first.
- Landing parses the `v/party/key` fragment, shows a "You've been invited to a watch party" hero with the decoded destination, hides Step 2 (create) / Step 3 (join blurb), and auto-forwards (1.5s, cancelable) when the extension's `data-watch-party-installed` marker is present.
- Extension marker is set in [client/userscript/main.ts](../client/userscript/main.ts) at boot when `location.hostname === "watch-party.pages.dev"`. Works for both userscript and MV3 extension since both bundle the same entry.
- Tested locally with a python static server + crafted hash — valid invite, broken-fragment, and step-hiding paths all verified.

**Deploy needed:** `npm run build && npm run deploy:landing`. Optional: cut a v0.3.1 GitHub release for the new userscript button (or roll into v0.4.0).

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What shipped this session

- **128-bit room IDs.** `ensureRoom()` in [client/userscript/main.ts](../client/userscript/main.ts) now generates 22-char base64url tokens via `randomToken(16)`. Old 8-hex-char rooms (32 bits) were scannable in principle; new rooms are not.
- **Optional passphrase gate.** `Hello` carries an optional `passphrase` field (in [shared/protocol.ts](../shared/protocol.ts)). The relay pins the passphrase on first connection ([relay/room.ts](../relay/room.ts)); mismatched joiners get a `{type: "rejected", reason: "passphrase"}` and a 4001 close. Empty rooms reset the pin so admins can change/clear the key.
- **Admin-only panel UI.** "🔒 Add room key" toggle under "Copy room link" in [client/userscript/ui/panel.ts](../client/userscript/ui/panel.ts). Submitting rewrites the URL fragment with `&key=` and force-closes the WS to re-pin on the relay.
- **Docs updated.** [relay/CLAUDE.md](../relay/CLAUDE.md) supersedes the old "Don't add auth" rule.

Commits on `main`:
- `58ba6b2` — Harden rooms: 128-bit IDs + optional passphrase gate.
- `cbe2e27` — v0.3.0: rebuild extension with room hardening.

Release: [v0.3.0 — Room hardening](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.0).

## Threat model in plain terms

- **Random scanner hitting your relay URL** with a guessed room: blocked by entropy. 128-bit search space.
- **Friend forwards your full URL to someone you didn't intend:** still in. Same as before. Use a passphrase if this matters.
- **You want OOB protection:** click "🔒 Add room key" in the panel as admin, set a value, copy the new link. Tell friends the key separately (voice/text). URL alone is no longer enough.

## Exact next step

No blocker; pick one when next session opens:

1. **Deploy the landing helper.** `npm run build && npm run deploy:landing` to push the invited-hero UI live on `watch-party.pages.dev`. Then manually verify on prod: paste an onboarding link into a profile without the extension → invited hero renders; install extension → reload → auto-forwards.
2. **Manual smoke test on prod for v0.3.0 room hardening.** Two browser profiles: (a) URL has 22-char `party=`, (b) "Add room key" reconnects with `&key=`, (c) wrong-key profile is rejected with the banner.
3. **Icon design.** Chrome still shows the puzzle-piece icon for the extension.
4. **Wrangler upgrade.** Currently 3.114.17 against `^3.90.0`; v4 is out and the CLI warns on every deploy.

## Open decisions

- Whether to surface the passphrase UI to non-admins as a read-only "🔒 This room is keyed" indicator, or keep it admin-only and invisible to others (current).
- Whether the next feature direction is presence richness (typing indicators, reactions) or reliability (service-worker WS migration for SPA episode navigation).

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on the receiver if they haven't clicked the page. Mitigation idea: mute-first-then-unmute on receiver's initial sync (unimplemented).
- CSP-locked stream providers on Cineby still won't accept the content script; user works around it by switching source.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- CI workflows (`e56ef06`, `bcaafc2`) exist now — deploy ran automatically on this push. Verify the auto-deploy didn't republish a stale relay (it shouldn't — the workflow builds from main).
