import { runIframeBridge } from "../userscript/iframe-bridge";
import { bootTopFrame, type BootHandle } from "../userscript/main";

// MV3 ambient (kept minimal to avoid pulling @types/chrome)
declare const chrome: {
  runtime: {
    onMessage: {
      addListener: (cb: (msg: unknown, sender: unknown, sendResponse: (r?: unknown) => void) => boolean | void) => void;
    };
  };
};

interface WindowWithWP extends Window {
  __WATCH_PARTY__?: {
    handle: BootHandle;
    teardown: () => void;
    remount: () => void;
    shutdown: () => void;
  };
}

if (window !== window.top) {
  // Iframes always run the bridge — the top frame decides whether to use it.
  runIframeBridge();
} else {
  const w = window as WindowWithWP;
  if (w.__WATCH_PARTY__) {
    // Re-injection after a soft teardown: just remount the UI on the existing instance.
    w.__WATCH_PARTY__.remount();
  } else {
    const handle = bootTopFrame();
    w.__WATCH_PARTY__ = {
      handle,
      teardown: () => handle.teardownUI(),
      remount: () => handle.remountUI(),
      shutdown: () => handle.shutdown(),
    };
    chrome.runtime.onMessage.addListener((msg) => {
      const m = msg as { type?: string } | null;
      if (!m || typeof m.type !== "string") return;
      const wp = (window as WindowWithWP).__WATCH_PARTY__;
      if (!wp) return;
      if (m.type === "wp-deactivate") wp.teardown();
      else if (m.type === "wp-hard-disconnect") wp.shutdown();
      else if (m.type === "wp-remount") wp.remount();
    });
  }
}
