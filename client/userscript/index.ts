import { runIframeBridge } from "./iframe-bridge";
import { bootTopFrame } from "./main";
import { isHostDisabled, mountActivator, setHostDisabled, type ActivatorHandle } from "./ui/activator";

if (window !== window.top) {
  runIframeBridge();
} else {
  if (location.hostname === "watch-party.pages.dev") {
    document.documentElement.dataset.watchPartyInstalled = "1";
  }
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
function startLifecycle(): void {
  let activator: ActivatorHandle | null = null;

  const activate = (clearDisabled = true) => {
    if (clearDisabled) setHostDisabled(false);
    activator?.destroy();
    activator = null;
    bootTopFrame(() => {
      // Called when the user clicks "Turn off here" from inside the panel.
      // Replace it with the floating activator.
      activator = mountActivator(() => activate(true));
    });
  };

  if (isHostDisabled() && !hasInviteHash()) {
    activator = mountActivator(() => activate(true));
  } else {
    activate(false);
  }
}
