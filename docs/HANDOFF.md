# Watch-Party — Handoff

Last updated: 2026-05-16
Milestone: **v0.3.1 shipped — landing deep-link helper live on prod; wrangler upgraded to v4**

## Status

v0.3.1 is live. The landing deep-link helper already deployed automatically when [f081741](https://github.com/AviouslyAvi/Watch-Party/commit/f081741) merged to main (CI's `landing` job picked up the `landing/**` change and pushed to Cloudflare Pages). This session bumped `client/extension/manifest.json` to `0.3.1` and `client/userscript/banner.txt` to `0.3.1`, which triggered CI's `extension-release` job and auto-cut the [v0.3.1 GitHub release](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1) with the prod-built zip.

Existing v0.3.0 userscript users now see Tampermonkey's update banner. Extension users on v0.3.0 need to reload-from-unpacked or refresh from the new zip — there's no auto-update channel.

### Landing deep-link helper — live in prod

- Userscript panel has a **"Copy onboarding link"** button under "Copy room link". It generates `https://watch-party.pages.dev/#v=<base64url(video-url)>&party=<id>&key=<pass>` — routes non-installers through the landing page first instead of bouncing off a raw deep link.
- Landing parses the `v/party/key` fragment, shows a "You've been invited to a watch party" hero with the decoded destination, hides Step 2 (create) / Step 3 (join blurb), and auto-forwards (1.5s, cancelable) when the extension's `data-watch-party-installed` marker is present.
- Extension marker is set in [client/userscript/main.ts](../client/userscript/main.ts) at boot when `location.hostname === "watch-party.pages.dev"`. Works for both userscript and MV3 extension since both bundle the same entry.
- Verified in prod by curling `https://watch-party.pages.dev/app.js` — byte-identical to `landing/app.js` on main (4954 bytes).

### Production endpoints

| Service | URL |
|---|---|
| Relay (Worker + Durable Object) | `wss://avious-party-relay.avibenabram.workers.dev` |
| Landing page (Cloudflare Pages) | `https://watch-party.pages.dev/` |
| Latest release (zip) | `https://github.com/AviouslyAvi/Watch-Party/releases/latest` |
| Source repo | `https://github.com/AviouslyAvi/Watch-Party` |

## What shipped this session

- **v0.3.1 release cut.** Bumped `client/extension/manifest.json` and `client/userscript/banner.txt` to `0.3.1`. CI's `extension-release` job rebuilt the MV3 extension against the prod relay (`wss://avious-party-relay.avibenabram.workers.dev`), zipped it, and published [Watch-Party v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1) (`watch-party-0.3.1.zip`, 7294 bytes). Existing v0.3.0 Tampermonkey users now see the update banner.
- **Confirmed landing deep-link helper is already live in prod.** Prior session's HANDOFF said "not yet redeployed," but CI's `landing` job had auto-deployed on the f081741 merge. Verified by curling `https://watch-party.pages.dev/app.js` (4954 bytes, byte-identical to `landing/app.js` on main).
- **Confirmed CI path filters work.** This push touched only `client/extension/manifest.json` and `client/userscript/banner.txt`, so the `relay` job was correctly skipped (no relay republish). Only `extension-release` ran.
- **Wrangler upgraded 3.114.17 → 4.92.0.** Bumped `wrangler` from `^3.90.0` to `^4.0.0` in `package.json` and refreshed the lockfile (resolved 4.92.0). Updated `WRANGLER_VERSION` in `.github/workflows/deploy.yml` to `4.92.0`. Verified locally: `wrangler --version` reports 4.92.0, `wrangler deploy --config relay/wrangler.toml --dry-run` parses the Durable Object binding cleanly with no deprecation warnings, `wrangler dev` boots the relay on `127.0.0.1:8787` and binds `env.ROOM` in local mode, `wrangler pages deploy --help` still shows the v3 flag shape (no script changes needed). `npm run typecheck` passes. Migration impact was minimal — repo has no KV/R2 (the v4 "local-mode-by-default" shift only affects those), no wildcard dynamic imports (esbuild 0.24 change), no legacy `publish`/`pages publish` commands. CI's `relay` and `landing` jobs are path-filtered so they'll skip on this commit; v4 will first exercise in CI on the next `relay/**` or `landing/**` change.

Commits on `main`:
- `9bbe73f` — v0.3.1: ship landing deep-link helper + Copy onboarding link button.
- `c7a7eae` — ci: sync extension-build/ for v0.3.1 (auto-pushed by CI).

Release: [v0.3.1](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.1). Earlier: [v0.3.0 — Room hardening](https://github.com/AviouslyAvi/Watch-Party/releases/tag/v0.3.0).

## Threat model in plain terms

- **Random scanner hitting your relay URL** with a guessed room: blocked by entropy. 128-bit search space.
- **Friend forwards your full URL to someone you didn't intend:** still in. Same as before. Use a passphrase if this matters.
- **You want OOB protection:** click "🔒 Add room key" in the panel as admin, set a value, copy the new link. Tell friends the key separately (voice/text). URL alone is no longer enough.

## Exact next step

No blocker; pick one when next session opens:

1. **End-to-end smoke on v0.3.1 with two browser profiles.** Still owed from this session — couldn't be done from the agent. (a) Profile A: install v0.3.1 from the new release zip, open a video page, click **Copy onboarding link**, confirm clipboard has `https://watch-party.pages.dev/#v=…&party=…`. (b) Profile B: paste that link in a clean browser → invited hero renders, Step 1 visible, Step 2/3 hidden. Install extension, reload → status flips to "Extension detected — opening in 1.5s…", auto-forwards. Bonus: try a broken fragment (`#v=garbage&party=ABC`) → fallback hero; click during countdown → cancel banner.
2. **Manual smoke test on prod for v0.3.0 room hardening.** Two browser profiles: (a) URL has 22-char `party=`, (b) "Add room key" reconnects with `&key=`, (c) wrong-key profile is rejected with the banner.
3. **Icon design.** Chrome still shows the puzzle-piece icon for the extension.
4. ~~**Wrangler upgrade.**~~ Done — now on 4.92.0. First CI exercise will be the next `relay/**` or `landing/**` change.

## Open decisions

- Whether to surface the passphrase UI to non-admins as a read-only "🔒 This room is keyed" indicator, or keep it admin-only and invisible to others (current).
- Whether the next feature direction is presence richness (typing indicators, reactions) or reliability (service-worker WS migration for SPA episode navigation).

## Known unknowns / risks

- Autoplay policy may block programmatic `.play()` on the receiver if they haven't clicked the page. Mitigation idea: mute-first-then-unmute on receiver's initial sync (unimplemented).
- CSP-locked stream providers on Cineby still won't accept the content script; user works around it by switching source.
- WS reconnect on close is naive (fixed 2s). Fine for v1.
- CI's `deploy.yml` is now load-bearing: it auto-cuts a GitHub release whenever `client/extension/manifest.json` changes, and auto-deploys the landing page whenever `landing/**` changes. Don't bump the manifest version casually — it will publish.
- Relay deploy is gated on `relay/**` or `shared/**` changes (verified this push). Safe to push code-only changes to client without republishing the relay.
