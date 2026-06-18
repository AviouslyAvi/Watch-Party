# Firefox/Zen extension support + extension icons

Date: 2026-06-18
Status: accepted

## Context

The MV3 extension was Chrome-only and shipped with no icon (Chrome rendered the
default puzzle-piece). Two asks landed together:

1. Make the extension installable on Firefox — specifically Zen, which is a
   Firefox/Gecko fork, so "Firefox support" covers it.
2. Give it a real toolbar/store icon (long-standing handoff item).

The blocker for Gecko was the background context: the manifest declares a
`background.service_worker`, which Gecko MV3 does not support — it uses an
event-page `background.scripts` array. The activation logic already avoids
`setTimeout` and drives all teardown through `chrome.alarms` precisely because
the background context can unload, so it ports to an event page unchanged.

## Decision

Add a third build target (`TARGET=firefox` / `npm run build:firefox`) that emits
`dist/extension-firefox/` from the **same** `background.ts` / `content.ts`, with
build-time deltas instead of forked source:

- **Manifest transform** (in `build.mjs`): `background.service_worker` →
  `background.scripts`; add `browser_specific_settings.gecko` with an add-on id
  and `strict_min_version: 115.0` (the floor where `storage.session` exists).
- **Namespace shim**: a one-line esbuild banner, `var chrome =
  globalThis.browser || globalThis.chrome;`, applied only to the Firefox bundles.
  Gecko's `browser.*` is promise-based, which is what the source's `await`s
  expect; Chrome bundles keep native `chrome` (which also returns promises in MV3).

Icons: `client/extension/icons/icon.svg` is the source (orange rounded square +
white play triangle, matching the `#f97316` ON badge). `gen-icons.mjs` rasterizes
it to 16/32/48/128 PNGs via `sharp`; the PNGs are committed so normal builds don't
need `sharp`. Referenced from `manifest.json` `icons` + `action.default_icon`.

Shipped as **v0.8.3** (patch — small additive feature, per the versioning policy).

## Alternatives considered

- **`webextension-polyfill` instead of a one-line shim** — heavier dependency for
  what a single `browser || chrome` alias solves, given the small API surface.
- **Fork the manifest into a checked-in `manifest.firefox.json`** — drifts from
  the Chrome manifest on every change; a build-time transform stays in lockstep.
- **A separate Firefox source tree** — needless; the only runtime difference is
  the namespace, handled by the banner.
- **Bump to a minor (v0.9.0)** — rejected; policy is patch-by-default unless the
  user calls a real minor.

## Consequences

- `build.mjs` now owns the Gecko manifest shape; manifest changes that affect
  background/permissions must be re-checked against the transform.
- CI (`deploy.yml`) builds the Firefox zip and attaches
  `watch-party-firefox-<ver>.zip` to each release alongside the Chrome zip.
- Gecko treats `<all_urls>` as opt-in host permissions — first activation on a
  new site may require a user grant. Documented in the extension README.
- AMO (addons.mozilla.org) listing would need signing/review; sideloading via
  `about:debugging` works today but clears on browser restart.
- Fixed a latent bug: `extension-build/` (the loadable-unpacked Chrome dir) was
  missing `background.js` since the v0.5.0 dormant refactor. CI now syncs the full
  set (content.js, background.js, manifest.json, icons/).
