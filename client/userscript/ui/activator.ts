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
  btn.innerHTML = `<span aria-hidden="true" style="font-size:18px;line-height:1;">🎬</span><span style="font:600 13px/1 system-ui, sans-serif;">Watch-Party</span>`;
  btn.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 999px;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.18);
    box-shadow: 0 6px 22px rgba(0,0,0,0.5), 0 0 0 4px rgba(249,115,22,0.18);
    cursor: pointer;
    line-height: 1;
    z-index: 2147483647;
    transition: transform 150ms ease, box-shadow 200ms ease;
    animation: cp-activator-pulse 2.6s ease-in-out infinite;
  `;
  // Inject the pulse keyframes once.
  if (!document.getElementById("cp-activator-keyframes")) {
    const styleEl = document.createElement("style");
    styleEl.id = "cp-activator-keyframes";
    styleEl.textContent = `
      @keyframes cp-activator-pulse {
        0%, 100% { box-shadow: 0 6px 22px rgba(0,0,0,0.5), 0 0 0 4px rgba(249,115,22,0.18); }
        50%      { box-shadow: 0 6px 22px rgba(0,0,0,0.5), 0 0 0 10px rgba(249,115,22,0.06); }
      }
    `;
    document.head.appendChild(styleEl);
  }
  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.04)";
  });
  btn.addEventListener("mouseleave", () => {
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
