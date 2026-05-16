// Site-aware "host changed video" detection. Calls onChange(absoluteUrl)
// whenever a same-domain navigation/src-swap looks like a new video. Caller
// is responsible for cross-domain rejection (already same-host by construction)
// and for de-bouncing emit-vs-receive races.

export interface WatcherHandle {
  dispose(): void;
}

type Listener = (url: string) => void;

const YT_HOSTS = /(^|\.)youtube\.com$/;
const NETFLIX_HOSTS = /(^|\.)netflix\.com$/;

export function watchVideoChanges(onChange: Listener): WatcherHandle {
  const host = location.host;
  let lastEmitted = currentSignature();
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    const next = currentSignature();
    if (next === lastEmitted) return;
    lastEmitted = next;
    onChange(location.href);
  };

  // Debounced version for noisy MutationObserver paths.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const emitDebounced = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(emit, 250);
  };

  // 1) Generic: SPA route changes (popstate + pushState/replaceState patch)
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args as Parameters<typeof history.pushState>);
    queueMicrotask(emit);
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args as Parameters<typeof history.replaceState>);
    queueMicrotask(emit);
    return r;
  };
  const onPop = () => emit();
  window.addEventListener("popstate", onPop);

  // 2) YouTube: yt-navigate-finish is the SPA's authoritative "video switched"
  const onYtNav = () => emit();
  if (YT_HOSTS.test(host)) {
    window.addEventListener("yt-navigate-finish", onYtNav as EventListener);
  }

  // 3) Netflix: pathname polling (no public navigation event)
  let netflixTimer: ReturnType<typeof setInterval> | null = null;
  if (NETFLIX_HOSTS.test(host)) {
    let lastPath = location.pathname;
    netflixTimer = setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        emit();
      }
    }, 500);
  }

  // 4) Generic: <video src> / <source src> mutations (Vimeo, raw <video>, etc.)
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes" && (r.attributeName === "src" || r.attributeName === "currentSrc")) {
        emitDebounced();
        return;
      }
      if (r.type === "childList") {
        for (const n of Array.from(r.addedNodes).concat(Array.from(r.removedNodes))) {
          if (n instanceof HTMLElement && (n.tagName === "VIDEO" || n.tagName === "SOURCE")) {
            emitDebounced();
            return;
          }
        }
      }
    }
  });
  mo.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "currentSrc"],
  });

  return {
    dispose() {
      disposed = true;
      try { window.removeEventListener("popstate", onPop); } catch {}
      try { window.removeEventListener("yt-navigate-finish", onYtNav as EventListener); } catch {}
      if (netflixTimer) clearInterval(netflixTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      try { mo.disconnect(); } catch {}
      // Best-effort restore; if other code patched too, just leave it.
      try { history.pushState = origPush; history.replaceState = origReplace; } catch {}
    },
  };
}

// Stable signature for "are we on the same video?". Site-aware so we don't
// re-emit on YouTube's t-param tweaks or fragment churn.
function currentSignature(): string {
  const u = new URL(location.href);
  if (YT_HOSTS.test(u.host) && u.pathname === "/watch") {
    return `yt:${u.searchParams.get("v") ?? ""}`;
  }
  if (NETFLIX_HOSTS.test(u.host)) {
    return `nf:${u.pathname}`;
  }
  // Generic: pathname only — strip hash and query so a play position doesn't trigger.
  return `g:${u.host}${u.pathname}`;
}

export function sameHost(otherUrl: string): boolean {
  try {
    return new URL(otherUrl).host === location.host;
  } catch {
    return false;
  }
}
