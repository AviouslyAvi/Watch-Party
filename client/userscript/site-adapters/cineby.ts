import { flashButton, type SiteAdapter } from "./index";

// Cineby launcher button. Cineby's DOM isn't public-documented and the
// player is iframe-embedded (CSP-locked), so we anchor to the Cineby
// chrome itself rather than the player. Best-effort: try a few likely
// header / nav anchors; if none hit, fall back to a fixed-position pill
// in the top-right corner of the viewport (distinct from the activator's
// bottom-right 🎬, so they don't visually clash).

export const cinebyAdapter: SiteAdapter = {
  host: "cineby.app",

  findAnchor() {
    // Only on watch/play pages — Cineby's homepage and browse views are
    // not useful contexts for "start a party." Watch routes typically look
    // like /movie/<id>, /tv/<id>/season/<n>/episode/<n>, /watch/<id>.
    const path = location.pathname;
    const isWatchish = /^\/(movie|tv|show|watch|play|episode)\b/i.test(path);
    if (!isWatchish) return null;

    // Try candidate anchors in priority order. First hit wins.
    const candidates = [
      // Top-bar / app shell containers people commonly use:
      "header nav",
      "header [class*='right']",
      "header [class*='actions']",
      "header [class*='controls']",
      "[class*='top-bar'] [class*='actions']",
      "[class*='player-header']",
      "[class*='video-info'] [class*='actions']",
      // Last resort: any header element.
      "header",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // If absolutely nothing matched, return document.body — the mountButton
    // path will detect this sentinel and switch to fixed-position fallback.
    return document.body;
  },

  mountButton(anchor, onClick) {
    const usingFallback = anchor === document.body;

    const btn = document.createElement("button");
    btn.id = "cp-cineby-launch";
    btn.type = "button";
    btn.title = "Start a Watch-Party for this title — copies an invite link to share";
    btn.innerHTML = `
      <span aria-hidden="true" style="font-size:14px;line-height:1;">🎬</span>
      <span style="font:500 13px/1 system-ui, sans-serif;">Watch-Party</span>
    `;

    if (usingFallback) {
      // Fixed pill anchored top-right. Sits clear of the bottom-right activator.
      btn.style.cssText = `
        position: fixed; top: 14px; right: 14px;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 14px; border-radius: 999px;
        background: rgba(20,20,22,0.85); color: #f1f1f1;
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(6px);
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        z-index: 2147483646;
        transition: background 120ms ease, transform 120ms ease;
      `;
      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "scale(1.04)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "scale(1)";
      });
      document.body.appendChild(btn);
    } else {
      btn.style.cssText = `
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 999px;
        background: rgba(249,115,22,0.18); color: #f1f1f1;
        border: 1px solid rgba(249,115,22,0.45);
        cursor: pointer;
        margin-left: 8px;
        transition: background 120ms ease;
        vertical-align: middle;
      `;
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(249,115,22,0.32)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(249,115,22,0.18)";
      });
      anchor.appendChild(btn);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
      flashButton(btn, "✓ Invite copied");
    });

    return btn;
  },
};
