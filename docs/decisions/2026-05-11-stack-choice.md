# Stack choice: Tampermonkey + Cloudflare Worker DO

Date: 2026-05-11
Status: accepted

## Context

Avi wants a Teleparty-style watch party for cineby.sc that ships fast (today/tomorrow) and is easy for a small group of friends to install. Long-term wish list is a polished Chrome extension, but v1 has to be cheap to run and trivial to iterate.

## Decision

- **Client v1**: Tampermonkey userscript, single bundled `.user.js`. v2 will be an MV3 Chrome extension reusing the same `shared/` engine.
- **Relay**: Cloudflare Worker + a single Durable Object class (`Room`), one DO instance per room ID. No persistent storage.
- **Sync model**: client-side engine with admin-driven heartbeats (5s) and drift threshold (1.5s).
- **Permissions**: server-enforced. Non-admin events are dropped and a `revert` is sent back unless free-for-all is on.

## Alternatives considered

- **PartyKit**: very ergonomic, but adds a vendor on top of CF Workers. Not worth the extra layer for one DO.
- **Node `ws` server on Fly.io**: works, but cold starts and a process to babysit. Free tier is fine but worse than CF for global latency.
- **Pure WebRTC P2P with public STUN**: lowest latency, but signaling still needs a server, and NAT traversal failures would haunt the user. The relay is just a fan-out of small JSON messages — Worker is fine.
- **Chrome extension first**: more polish but slower to iterate and harder for friends to install (unpacked + dev mode, or a Web Store listing that may be rejected because Cineby is piracy-adjacent).

## Consequences

- WS URL is hardcoded at build time via `WS_URL` env var. Switching relays = rebuild.
- No persistence means a full DO restart (rare) loses room state mid-session. Acceptable for v1.
- Cineby's cross-origin stream iframe forces a `*://*/*` match in the userscript banner. The iframe bridge gates itself at runtime by checking `window === top`.
