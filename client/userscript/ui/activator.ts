// Tiny floating "wake-up" button shown when the user has manually turned
// Watch-Party off for the current host. Mirrors the dormant-by-default
// pattern the v0.5.0+ extension has via the toolbar icon — the userscript
// has no toolbar, so we put the affordance in the page itself.

export interface ActivatorHandle {
  destroy: () => void;
}

const STORAGE_PREFIX = "cp-off:";

export function isHostDisabled(host: string = location.hostname): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + host) === "1";
  } catch {
    return false;
  }
}

export function setHostDisabled(disabled: boolean, host: string = location.hostname): void {
  try {
    if (disabled) localStorage.setItem(STORAGE_PREFIX + host, "1");
    else localStorage.removeItem(STORAGE_PREFIX + host);
  } catch {
    // Storage blocked (e.g. some embedded iframes) — best-effort only.
  }
}

export function mountActivator(onActivate: () => void): ActivatorHandle {
  const btn = document.createElement("button");
  btn.id = "cp-activator";
  btn.title = "Turn Watch-Party on for this site (Alt+Shift+W)";
  btn.setAttribute("aria-label", "Activate Watch-Party");
  btn.textContent = "🎬";
  btn.style.cssText = `
    position: fixed;
    right: 12px;
    bottom: 12px;
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: #141416;
    color: #f97316;
    border: 1px solid #333;
    box-shadow: 0 4px 14px rgba(0,0,0,0.45);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0;
    z-index: 2147483647;
    opacity: 0.78;
    transition: opacity 150ms ease, transform 150ms ease;
  `;
  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1";
    btn.style.transform = "scale(1.06)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "0.78";
    btn.style.transform = "scale(1)";
  });
  btn.addEventListener("click", () => {
    onActivate();
  });
  document.body.appendChild(btn);

  // Same keyboard shortcut as the panel toggle — if the user nukes the visible
  // button somehow (page mutation, conflicting overlay), they can still wake it.
  const keyHandler = (e: KeyboardEvent) => {
    if (e.altKey && e.shiftKey && (e.key === "W" || e.key === "w")) {
      e.preventDefault();
      onActivate();
    }
  };
  document.addEventListener("keydown", keyHandler);

  return {
    destroy() {
      document.removeEventListener("keydown", keyHandler);
      btn.remove();
    },
  };
}
