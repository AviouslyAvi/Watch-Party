# Handoff — GitHub Actions CI/CD setup

Last updated: 2026-05-16
Topic: **Wire `.github/workflows/deploy.yml` to auto-deploy relay, landing, and extension releases on push to main.**

## Where we left off

Watch-Party is **fully live and shipping v0.2.0**. All three deploys are manual right now:

- Relay: `wss://avious-party-relay.avibenabram.workers.dev` (Cloudflare Workers, free tier, SQLite-DO).
- Landing: `https://watch-party.pages.dev/` (Cloudflare Pages, project name `watch-party`).
- Extension: GitHub Releases — latest `v0.2.0` with the in-extension update banner wired and verified by build (banner fetches `/releases/latest`, shows when tag != baked `VERSION`).

Avi chose **Option C** (GitHub Actions running wrangler) over Option B (Cloudflare dashboard Git integration), because the repo already has 3 deploy targets and the project culture is "config-in-repo" (CLAUDE.md / CONTEXT.md / HANDOFF pattern).

## Exact next step

Build a single `.github/workflows/deploy.yml` that on push to `main`:

1. Detects changed paths via `dorny/paths-filter` or `git diff`.
2. If `landing/**` changed → `wrangler pages deploy landing --project-name watch-party`.
3. If `relay/**` changed → `wrangler deploy --config relay/wrangler.toml`.
4. If `client/extension/manifest.json` version bumped → rebuild extension with prod `WS_URL`, sync `extension-build/`, commit back, zip, `gh release create v$VERSION ...`. (The auto-commit-back step needs `permissions: contents: write` and uses `GITHUB_TOKEN`.)

## Blocker — needs Avi

**Cloudflare API token must be created by Avi** (can't be done from CLI without an existing token). Steps:

1. Dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template.
2. Scope the token to account `15e39723199f14fa3cb56cf4e20e84cc` (Avibenabram@gmail.com's Account).
3. Add Pages permission too: under Account permissions add **Cloudflare Pages:Edit**.
4. Copy the token, add it to GitHub: repo Settings → Secrets and variables → Actions → New repository secret → name `CLOUDFLARE_API_TOKEN`.
5. Also add `CLOUDFLARE_ACCOUNT_ID` = `15e39723199f14fa3cb56cf4e20e84cc` as a secret (wrangler reads it).

Once those two secrets exist, the workflow can be written and pushed.

## Context the next chat needs

- Bake-time constants in `build.mjs`: `WS_URL`, `VERSION`, `RELEASES_API`, `RELEASES_URL`. CI must pass `WS_URL=wss://avious-party-relay.avibenabram.workers.dev` for any extension build.
- Auto-release-on-version-bump means: workflow reads `client/extension/manifest.json` version, checks `gh release view v$VERSION` to see if that tag already exists, and only ships if it doesn't. Prevents accidental duplicate releases on every push.
- `extension-build/` is committed prebuilt. If the workflow rebuilds it, it must commit-back (with `[skip ci]` in the message to avoid loops).
- `wrangler` version: project uses `^3.90.0` (currently 3.114.17 installed). CI should pin to a specific version, not `latest`, to avoid silent breakage.

## Open decisions for Avi

- **Auto-commit-back vs require manual `extension-build/` sync.** Auto is convenient but adds a bot commit on every release. Manual keeps history clean but means devs must remember to rebuild before pushing a version bump.
- **Whether to add typecheck-on-PR step now** (cheap, recommended) or defer.
- **Whether to deploy the relay on every `relay/**` change automatically**, or gate behind a manual approval. For 5 friends, auto is fine; if it ever opens up, gate it.

## Anchor files (read these first in the new chat)

- `package.json` (deploy scripts, wrangler version pin)
- `build.mjs` (constants the CI must inject)
- `relay/wrangler.toml` (`new_sqlite_classes` migration — already shipped)
- `client/extension/manifest.json` (version source of truth)
- This file.
