# Handoff — GitHub Actions CI/CD setup

Last updated: 2026-05-16
Status: **SHIPPED** — workflows written, committed pending (see "Immediate next step" below).
Topic: Auto-deploy relay, landing, and extension releases on push to main via GitHub Actions.

## What shipped

Two workflow files now exist in `.github/workflows/`:

- **`typecheck.yml`** — runs `npm run typecheck` on every PR to `main`.
- **`deploy.yml`** — on push to `main`, uses `dorny/paths-filter@v3` to detect changes and conditionally:
  - `landing/**` changed → `wrangler pages deploy landing --project-name watch-party --branch main`
  - `relay/**` or `shared/**` changed → `wrangler deploy --config relay/wrangler.toml`
  - `client/extension/manifest.json` changed → version-gated release flow: reads version, skips if `v$VERSION` tag exists, else builds with prod `WS_URL`, syncs `extension-build/`, auto-commits with `[skip ci]`, zips, `gh release create` with `--generate-notes`.

Pins: `wrangler@3.114.17`, Node 20, all actions pinned by major.

## Secrets in place

GitHub repo secrets at https://github.com/AviouslyAvi/Watch-Party/settings/secrets/actions:
- `CLOUDFLARE_API_TOKEN` (rotated 2026-05-16 after accidental paste in chat — old token dead)
- `CLOUDFLARE_ACCOUNT_ID` = `15e39723199f14fa3cb56cf4e20e84cc`

Token scope: Workers Scripts:Edit + Cloudflare Pages:Edit, scoped to Avibenabram@gmail.com's Account.

## Decisions locked

- **extension-build/** auto-commit-back from CI (`[skip ci]` to prevent loops).
- **Typecheck on PRs**: yes.
- **Relay deploy**: auto on push (no manual gate). Revisit if usage opens up beyond friend-group.

## Immediate next step

Commit + push the workflows from the worktree at `/Users/aviouslyavi/Claude/Watch-Party/objective-dhawan-aa1cf5`:

```bash
git add .github/workflows/
git commit -m "ci: add deploy + typecheck workflows"
git push
```

First run on main should fire `changes` only and skip all three deploy jobs (no surface changed). That's the smoke test.

## Verification plan (after push)

1. **typecheck**: open a throwaway PR with a whitespace change in README, confirm green check.
2. **landing**: no-op edit `landing/index.html`, push to main, watch `landing` job, curl `https://watch-party.pages.dev/`.
3. **relay**: no-op comment in `relay/worker.ts`, push, watch `relay` job, hit the Worker health endpoint.
4. **extension release**: bump `client/extension/manifest.json` version to `0.2.1`, push. Expect: `extension-release` job runs → auto-commits `extension-build/` → `v0.2.1` release with zip appears at releases page → installed extension's update banner picks up the new tag.
5. **Idempotency**: re-run the same workflow run from the Actions UI; the release job should hit the "already exists" gate and skip cleanly.

## Anchor files

- `.github/workflows/deploy.yml` (new)
- `.github/workflows/typecheck.yml` (new)
- `package.json` — `build:ext`, `typecheck`, `deploy:relay`, `deploy:landing` scripts (already wired).
- `build.mjs` — reads `WS_URL` from env.
- `client/extension/manifest.json` — version source of truth.
- `relay/wrangler.toml` — wrangler picks up via `--config`.

## Open follow-ups (not blocking)

- Cache `node_modules` only if CI minutes start to bite. Build is sub-30s today.
- Slack/Discord deploy notification webhook — nice-to-have.
- Chrome Web Store auto-publish path — explicitly deferred; v0.2.0 ships via GitHub Releases.
