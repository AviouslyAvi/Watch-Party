# landing/ — companion webpage (Layer 2)

Static site deployed to Cloudflare Pages. **Does not run sync** — that's only possible from the userscript / extension. This page is the onboarding funnel: install the userscript / extension, create or join a room, bounce to the target video page with the right `#party=` hash.

## Why this exists

Same-origin policy means a hosted webpage cannot reach into a cross-origin `<iframe>` and control another site's video. The userscript / extension is unavoidable. The landing page makes install + room-creation feel less janky.

## Load

- `index.html` — single page, no framework. Three sections: install, create, join.
- `style.css` — small stylesheet.
- `app.js` — generates UUID room IDs, builds room URLs with `#party=`, copies links to clipboard.
- `avious-party.user.js` — copy of the built userscript, served same-origin so "Install" links work without a release URL. Replaced at deploy time by `npm run build`.

## Skip

`../node_modules/`, `../shared/`, `../relay/`.

## Pipeline (visitor)

1. Lands on the page.
2. Clicks **Install userscript** → browser hands the raw `.user.js` to Tampermonkey, auto-installs.
3. Clicks **Create a room**, pastes any http(s) URL with a video player → page generates `<their-url>#party=<uuid>` and opens it in a new tab. Userscript activates there.
4. Or clicks **Join a room** with a shared link → opens directly.

## Rules

- No backend. Everything is static. Room IDs are generated client-side; the relay is authoritative.
- Never inline secrets. The WS URL belongs in the userscript / extension build, not here.
- Keep the page under 50 KB total. It's an onboarding tool, not an app.

## Deploy

```bash
npm run build                  # refresh landing/avious-party.user.js
npm run deploy:landing         # wrangler pages deploy landing/ --project-name avious-party
```

## Skills/MCP

None required.
