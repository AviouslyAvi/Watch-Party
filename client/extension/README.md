# v2: Chrome MV3 extension

Empty in v1. When starting:

1. Read `client/CLAUDE.md` for the two-stage pipeline rules.
2. Reuse `shared/` — do not fork it.
3. Manifest needs `content_scripts` matching `https://www.cineby.sc/*` and `all_frames: true` so the script runs in the player iframe too.
4. The service worker holds the WebSocket so it survives SPA navigation between episodes.
