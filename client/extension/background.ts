// MV3 service worker — owns per-tab activation state.
//
// Activation is OFF by default for every tab on every site. Clicking the
// toolbar icon toggles activation for the current tab:
//   ON  → inject content.js (all frames), set ON badge, clear any pending teardown alarm.
//   OFF → message tab to tear down UI (WS stays alive), set 30s socket-grace alarm.
//
// Per-tab activation is keyed by tabId in chrome.storage.session, recording the
// origin at activation. Same-origin reloads/navigations re-inject. Cross-origin
// navigations start a ~3 min grace; returning to the original origin cancels it.
// Tab close clears everything.

declare const chrome: AnyChrome;

type AnyChrome = {
  action: {
    onClicked: { addListener: (cb: (tab: { id?: number; url?: string }) => void) => void };
    setBadgeText: (d: { tabId: number; text: string }) => Promise<void>;
    setBadgeBackgroundColor: (d: { tabId: number; color: string }) => Promise<void>;
    setTitle: (d: { tabId: number; title: string }) => Promise<void>;
  };
  scripting: {
    executeScript: (d: {
      target: { tabId: number; allFrames?: boolean };
      files: string[];
    }) => Promise<unknown>;
  };
  storage: {
    session: {
      get: (keys: string | string[] | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (keys: string | string[]) => Promise<void>;
    };
  };
  tabs: {
    onRemoved: { addListener: (cb: (tabId: number) => void) => void };
    sendMessage: (tabId: number, msg: unknown) => Promise<unknown>;
  };
  webNavigation: {
    onCommitted: {
      addListener: (
        cb: (d: { tabId: number; frameId: number; url: string }) => void,
      ) => void;
    };
  };
  alarms: {
    create: (name: string, opts: { delayInMinutes: number }) => void;
    clear: (name: string) => Promise<boolean>;
    onAlarm: { addListener: (cb: (a: { name: string }) => void) => void };
  };
};

interface TabActivation {
  origin: string;
  activatedAt: number;
}

const SOCKET_GRACE_MIN = 0.5; // 30s — quick re-toggle reuses WS
const CROSS_DOMAIN_GRACE_MIN = 3; // 3 min — return to original domain restores
const KEY = (tabId: number) => `wp:${tabId}`;
const SOCKET_ALARM = (tabId: number) => `wp-socket-grace:${tabId}`;
const CROSS_ALARM = (tabId: number) => `wp-cross-grace:${tabId}`;

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

async function getActivation(tabId: number): Promise<TabActivation | null> {
  const out = await chrome.storage.session.get(KEY(tabId));
  const v = out[KEY(tabId)];
  return (v as TabActivation | undefined) ?? null;
}

async function setActivation(tabId: number, value: TabActivation): Promise<void> {
  await chrome.storage.session.set({ [KEY(tabId)]: value });
}

async function clearActivation(tabId: number): Promise<void> {
  await chrome.storage.session.remove(KEY(tabId));
}

async function inject(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (e) {
    // Restricted URLs (chrome://, web store, etc.) — leave inactive.
    console.warn("[watch-party] inject failed", e);
  }
}

async function send(tabId: number, msg: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    // No content script (e.g. tab navigated away) — fine.
  }
}

async function setIcon(tabId: number, active: boolean): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: active ? "ON" : "" }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f97316" }),
    chrome.action.setTitle({ tabId, title: active ? "Watch-Party (on — click to turn off)" : "Watch-Party (off — click to turn on)" }),
  ]);
}

async function activate(tabId: number, url: string): Promise<void> {
  const origin = originOf(url);
  await setActivation(tabId, { origin, activatedAt: Date.now() });
  await chrome.alarms.clear(SOCKET_ALARM(tabId));
  await chrome.alarms.clear(CROSS_ALARM(tabId));
  // If a soft-torn instance is still alive in the page, this tells it to remount;
  // if not, the inject below will boot a fresh one. Send first so the existing
  // instance picks up the message before any inject side effects.
  await send(tabId, { type: "wp-remount" });
  await inject(tabId);
  await setIcon(tabId, true);
}

async function deactivate(tabId: number): Promise<void> {
  await clearActivation(tabId);
  await chrome.alarms.clear(CROSS_ALARM(tabId));
  await send(tabId, { type: "wp-deactivate" });
  chrome.alarms.create(SOCKET_ALARM(tabId), { delayInMinutes: SOCKET_GRACE_MIN });
  await setIcon(tabId, false);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (typeof tab.id !== "number" || !tab.url) return;
  const current = await getActivation(tab.id);
  if (current) await deactivate(tab.id);
  else await activate(tab.id, tab.url);
});

chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return; // only top-frame nav decisions
  const act = await getActivation(d.tabId);
  if (!act) return;
  const newOrigin = originOf(d.url);
  if (newOrigin === act.origin) {
    // Same origin: cancel any pending cross-domain teardown, re-inject UI.
    await chrome.alarms.clear(CROSS_ALARM(d.tabId));
    await inject(d.tabId);
    await setIcon(d.tabId, true);
  } else if (newOrigin) {
    // Cross-origin: don't inject. Start grace window if not already pending.
    // We can't observe whether an alarm exists, but create() with the same name
    // replaces — so re-firing on every cross-domain hop just resets the timer,
    // which is the desired behavior (each new origin restarts the countdown).
    chrome.alarms.create(CROSS_ALARM(d.tabId), { delayInMinutes: CROSS_DOMAIN_GRACE_MIN });
    await setIcon(d.tabId, false);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearActivation(tabId);
  await chrome.alarms.clear(SOCKET_ALARM(tabId));
  await chrome.alarms.clear(CROSS_ALARM(tabId));
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const socketMatch = /^wp-socket-grace:(\d+)$/.exec(alarm.name);
  if (socketMatch) {
    const tabId = Number(socketMatch[1]);
    // If user re-activated within grace, we already cleared this alarm; firing
    // means they didn't. Tell the page to close the socket fully.
    const act = await getActivation(tabId);
    if (!act) await send(tabId, { type: "wp-hard-disconnect" });
    return;
  }
  const crossMatch = /^wp-cross-grace:(\d+)$/.exec(alarm.name);
  if (crossMatch) {
    const tabId = Number(crossMatch[1]);
    await clearActivation(tabId);
    await send(tabId, { type: "wp-hard-disconnect" });
    await setIcon(tabId, false);
    return;
  }
});
