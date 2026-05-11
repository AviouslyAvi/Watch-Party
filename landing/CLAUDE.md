# landing/ — companion webpage workspace (Layer 2)

Static site deployed to Cloudflare Pages. **Does not run sync** — that lives in the userscript. This page is the onboarding funnel: install the userscript, create or join a room, and bounce to cineby.sc with the right `#party=` hash.

## Why this exists

Same-origin policy means a hosted webpage cannot reach into a cross-origin `<iframe>` and control Cineby's video. The userscript is unavoidable. This landing page just makes the install + room-creation flow feel less janky.

## Files

- `index.html` — single page, no framework. Three sections: install, create, join.
- `style.css` — small stylesheet.
- `app.js` — generates room IDs, builds Cineby URLs with `#party=`, copies links.
- `cineby-party.user.js` — copy of the built userscript, served from the same origin so "Install" links work without a release URL. Replaced at deploy time.

## Pipeline

1. Visitor lands on the page.
2. Clicks **Install userscript** → browser hands the raw `.user.js` to Tampermonkey, which auto-installs.
3. Clicks **Create a room**, pastes their Cineby movie/show URL → page generates `<their-url>#party=<uuid>` and opens it in a new tab. Userscript activates there.
4. Or clicks **Join a room** with a shared link → opens directly.

## Rules

- No backend. Everything is static. Room IDs are generated client-side; the relay is authoritative.
- Never inline secrets. The WS URL belongs in the userscript, not here.
- Keep this page < 50KB total. It's an onboarding tool, not an app.

## Deploy

```bash
npm run deploy:landing   # wrangler pages deploy landing/ --project-name cineby-party
```

Before deploying, run `npm run build` so `landing/cineby-party.user.js` is fresh.
