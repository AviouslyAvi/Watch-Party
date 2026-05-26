import { flashButton, type SiteAdapter } from "./index";

// YouTube watch-page button. Sits next to Share in the actions row beneath the
// video. YouTube re-renders this row aggressively on /watch → /watch nav, so
// the registry's MutationObserver handles re-mounting.

export const youtubeAdapter: SiteAdapter = {
  host: ".youtube.com",

  findAnchor() {
    // Watch pages only — no point on home, search, channel, etc.
    if (!location.pathname.startsWith("/watch")) return null;

    // Strategy: locate the Share button by its aria-label (most stable cross-locale
    // signal — YouTube localizes the label, so we look for "Share" OR the element
    // structure around it). Then walk up to a wrapper we can insert a sibling into.
    const candidates = [
      'yt-button-view-model button[aria-label*="Share" i]',
      'button[aria-label*="Share" i]',
      'ytd-button-renderer button[aria-label*="Share" i]',
    ];
    let shareBtn: Element | null = null;
    for (const sel of candidates) {
      shareBtn = document.querySelector(sel);
      if (shareBtn) break;
    }
    if (!shareBtn) return null;

    // The shareBtn's nearest insertable wrapper. We try, in order:
    //   yt-button-view-model (newest 2026 layout)
    //   ytd-button-renderer (older layout)
    //   button's parentElement (fallback)
    const wrapper =
      shareBtn.closest("yt-button-view-model") ??
      shareBtn.closest("ytd-button-renderer") ??
      shareBtn.parentElement;
    return wrapper;
  },

  mountButton(anchor, onClick) {
    const btn = document.createElement("button");
    btn.id = "cp-yt-launch";
    btn.type = "button";
    btn.title = "Start a Watch-Party for this video — copies an invite link to share";
    btn.innerHTML = `
      <span aria-hidden="true" style="font-size:16px;line-height:1;">🎬</span>
      <span style="font:500 14px/20px 'Roboto', sans-serif;">Watch-Party</span>
    `;
    btn.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      padding: 0 14px; height: 36px; border-radius: 18px;
      background: rgba(255,255,255,0.1); color: #f1f1f1;
      border: none; cursor: pointer;
      margin-left: 8px;
      transition: background 120ms ease;
      vertical-align: middle;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(255,255,255,0.2)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(255,255,255,0.1)";
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
      flashButton(btn, "✓ Invite copied");
    });

    // Insert AFTER the anchor (so we sit right of Share).
    anchor.parentElement?.insertBefore(btn, anchor.nextSibling);
    return btn;
  },
};
