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
