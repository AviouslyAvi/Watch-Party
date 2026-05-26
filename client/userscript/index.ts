import { runIframeBridge } from "./iframe-bridge";
import { bootTopFrame, type BootHandle } from "./main";
import { isHostDisabled, mountActivator, setHostDisabled, type ActivatorHandle } from "./ui/activator";
import { findAdapter, runSiteAdapter, type SiteAdapter } from "./site-adapters";
import { youtubeAdapter } from "./site-adapters/youtube";
import { cinebyAdapter } from "./site-adapters/cineby";

const SITE_ADAPTERS: SiteAdapter[] = [youtubeAdapter, cinebyAdapter];

declare const VERSION: string;

if (window !== window.top) {
  runIframeBridge();
} else {
  if (location.hostname === "watch-party.pages.dev") {
    document.documentElement.dataset.watchPartyInstalled = "1";
  }
  // Loud-and-proud boot log so users can verify the script is actually running
  // and what version they're on. Filter the console with "Watch-Party" to find it.
  console.log(
    `%c🎬 Watch-Party v${VERSION} loaded`,
    "background:#f97316;color:#fff;font-weight:600;padding:2px 8px;border-radius:4px;",
  );
  startLifecycle();
}

function hasInviteHash(): boolean {
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const party = params.get("party");
    return !!party && party.length > 0;
  } catch {
    return false;
  }
}

// Top-level lifecycle: either boot the full panel + WS, or mount a tiny
// activator and wait for the user to wake the script up. Invite-link hashes
// override the user's "off here" preference — they're the explicit opt-in
// signal, same convention as the extension's onCommitted hash check.
//
// On supported sites (YouTube, Cineby), we ALSO mount a contextual button
// next to the site's own share/action affordance. That button activates if
// dormant, then copies an invite link.
function startLifecycle(): void {
  let activator: ActivatorHandle | null = null;
  let boot: BootHandle | null = null;
  let teardownSiteBtn: (() => void) | null = null;

  const adapter = findAdapter(SITE_ADAPTERS, location.hostname);

  const onSiteButtonClick = () => {
    // If the userscript is currently dormant, activate first. Then copy link.
    if (!boot) activate(true);
    // boot is now set; calling copyInviteLink kicks the clipboard + system
    // message. Schedule on microtask so any panel mount completes first.
    queueMicrotask(() => boot?.copyInviteLink());
  };

  const mountSiteBtnIfAny = () => {
    if (!adapter || teardownSiteBtn) return;
    teardownSiteBtn = runSiteAdapter(adapter, onSiteButtonClick);
  };

  const activate = (clearDisabled: boolean) => {
    if (clearDisabled) setHostDisabled(false);
    activator?.destroy();
    activator = null;
    boot = bootTopFrame(() => {
      // Called when user clicks "Turn off here" from inside the panel.
      boot = null;
      activator = mountActivator(() => activate(true));
      // Site button stays — it's a quick way to wake the script back up.
    });
    mountSiteBtnIfAny();
  };

  if (isHostDisabled() && !hasInviteHash()) {
    activator = mountActivator(() => activate(true));
    // Mount the site button even while dormant — clicking it wakes the script.
    mountSiteBtnIfAny();
  } else {
    activate(false);
  }
}
