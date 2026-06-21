// Site-adapter registry. Each adapter knows where to slot a "Start Watch-Party"
// button on a known site (YouTube next to Share, Cineby in its top chrome, etc).
// The registry watches for SPA navigation and remounts as needed.

export interface SiteAdapter {
  /** Hostname match — exact, or subdomain via leading "." (e.g. ".youtube.com"). */
  host: string;
  /** Returns the element our button should sit next to, or null if N/A on this page. */
  findAnchor: () => Element | null;
  /** Creates the actual button element and inserts it near the anchor. Returns the button. */
  mountButton: (anchor: Element, onClick: () => void) => HTMLElement;
}

export function hostMatches(adapterHost: string, currentHost: string): boolean {
  if (adapterHost.startsWith(".")) {
    return currentHost.endsWith(adapterHost) || currentHost === adapterHost.slice(1);
  }
  return currentHost === adapterHost;
}

export function findAdapter(adapters: SiteAdapter[], host: string): SiteAdapter | null {
  for (const a of adapters) if (hostMatches(a.host, host)) return a;
  return null;
}

/**
 * Mount the site adapter's button. Re-mounts on DOM mutation when the anchor
 * gets swapped out (SPA navigations). Returns a cleanup function.
 */
export function runSiteAdapter(adapter: SiteAdapter, onClick: () => void): () => void {
  let currentBtn: HTMLElement | null = null;

  const ensureMounted = () => {
    // Already mounted and still in the document? Done.
    if (currentBtn && document.contains(currentBtn)) return;
    currentBtn = null;
    const anchor = adapter.findAnchor();
    if (!anchor) return;
    try {
      currentBtn = adapter.mountButton(anchor, onClick);
    } catch (e) {
      console.warn("[watch-party] site adapter mount failed", e);
    }
  };

  ensureMounted();
  // Debounce mutation pings; YouTube's DOM churns a lot.
  let pending = false;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      ensureMounted();
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    currentBtn?.remove();
    currentBtn = null;
  };
}

/** Brief visual confirmation flash for a clicked site button. */
export function flashButton(btn: HTMLElement, message = "✓ Copied"): void {
  const original = btn.innerHTML;
  const originalBg = btn.style.background;
  btn.innerHTML = `<span style="font-weight:600;">${message}</span>`;
  btn.style.background = "rgba(34, 197, 94, 0.25)";
  setTimeout(() => {
    btn.innerHTML = original;
    btn.style.background = originalBg;
  }, 1400);
}

// ─────────────────────────── Shared launcher button ────────────────────────
// The Watch-Party launch button used by every streaming adapter. When the
// adapter found a real anchor in the page chrome we sit an inline orange pill
// next to it; when it returned the `document.body` sentinel (no anchor found)
// we fall back to a fixed dark-glass pill in the top-right corner — kept clear
// of the bottom-right activator 🎬 so they never visually clash.
export function mountLauncherButton(anchor: Element, onClick: () => void, idSuffix: string): HTMLElement {
  const usingFallback = anchor === document.body;
  const btn = document.createElement("button");
  btn.id = `cp-launch-${idSuffix}`;
  btn.type = "button";
  btn.title = "Start a Watch-Party for this title — copies an invite link to share";
  btn.innerHTML = `
    <span aria-hidden="true" style="font-size:14px;line-height:1;">🎬</span>
    <span style="font:500 13px/1 system-ui, sans-serif;">Watch-Party</span>
  `;

  if (usingFallback) {
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
    btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.04)"; });
    btn.addEventListener("mouseleave", () => { btn.style.transform = "scale(1)"; });
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
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(249,115,22,0.32)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "rgba(249,115,22,0.18)"; });
    anchor.appendChild(btn);
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
    flashButton(btn, "✓ Invite copied");
  });

  return btn;
}

// Factory for the common streaming-site adapter shape: only show on watch-ish
// pages, try a priority list of header/chrome anchors, and fall back to the
// fixed top-right pill when none match. New sites are typically one of these.
export function makeStreamingAdapter(opts: {
  host: string;
  idSuffix: string;
  isWatchPage: () => boolean;
  candidates: string[];
}): SiteAdapter {
  return {
    host: opts.host,
    findAnchor() {
      if (!opts.isWatchPage()) return null;
      for (const sel of opts.candidates) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      // Sentinel: mountButton switches to the fixed-position fallback pill.
      return document.body;
    },
    mountButton(anchor, onClick) {
      return mountLauncherButton(anchor, onClick, opts.idSuffix);
    },
  };
}
