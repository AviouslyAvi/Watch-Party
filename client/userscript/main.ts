import { createSyncClient, type VideoAdapter } from "../../shared/sync";
import type { WireMsg, SyncMsg, VideoChangeMsg } from "../../shared/protocol";
import { runIframeBridge, IFRAME_TAG } from "./iframe-bridge";
import { mountPanel } from "./ui/panel";
import { loadSettings, getSettings, onSettingsChange, updateSettings } from "../extension/lib/settings";
import { sameHost, watchVideoChanges } from "../extension/lib/video-watcher";

declare const WS_URL: string;
declare const VERSION: string;
declare const RELEASES_API: string;
declare const RELEASES_URL: string;

const isTopFrame = window === window.top;

if (!isTopFrame) {
  runIframeBridge();
} else {
  void bootTopFrame();
}

async function bootTopFrame() {
  await loadSettings();

  // ---------------- WAKE GATING ----------------
  // The extension is dormant unless one of these is true:
  //   1) the URL hash carries a #party= signature (room link), OR
  //   2) the user clicked "Start watch party on this page" in the popup.
  // The master kill switch (master_enabled) short-circuits both.
  // We re-evaluate on hashchange, on storage change, and on popup messages.

  let session: Session | null = null;

  function reevaluate() {
    const s = getSettings();
    const room = readRoomFragment();
    const want = s.master_enabled && room.roomId !== null;
    if (want && !session) {
      session = startSession(room.roomId!, room.passphrase);
    } else if (!want && session) {
      session.dispose();
      session = null;
    }
  }

  window.addEventListener("hashchange", reevaluate);
  onSettingsChange(reevaluate);
  registerRuntimeMessageHandler({
    onStart: () => {
      // Write a new fragment and wake.
      const id = randomToken(16);
      writeRoomFragment(id, null);
      reevaluate();
      return currentRoomUrl(id, null);
    },
    getStatus: () => {
      if (!session) return { inRoom: false, isHost: false, roomUrl: "", count: 0, hostName: null };
      return session.statusSnapshot();
    },
    getCopyLink: () => session?.currentUrl() ?? "",
  });

  reevaluate();
}

interface SessionStatus {
  inRoom: boolean;
  isHost: boolean;
  roomUrl: string;
  count: number;
  hostName: string | null;
}

interface Session {
  dispose(): void;
  statusSnapshot(): SessionStatus;
  currentUrl(): string;
}

function startSession(roomId: string, initialPassphrase: string | null): Session {
  let me = loadStoredName() ?? "";
  let passphrase: string | null = initialPassphrase;
  const currentRoomUrl = () => roomLinkForCurrent(roomId, passphrase);

  let you = "";
  let adminId = "";
  let freeForAll = false;
  let ws: WebSocket | null = null;
  let rejected = false;
  let participants: import("../../shared/protocol").Participant[] = [];

  const panel = mountPanel({
    onCopyLink: () => {
      const url = currentRoomUrl();
      navigator.clipboard.writeText(url).then(
        () => panel.appendSystem("Room link copied."),
        () => panel.appendSystem("Copy failed — link: " + url),
      );
    },
    onToggleFFA: (next) => {
      freeForAll = next;
      send({ type: "ffa", freeForAll: next });
    },
    onSendChat: (text) => {
      send({ type: "chat", from: you, name: me, text, ts: Date.now() });
      panel.appendChat(me, text, { fromMe: true });
    },
    onSubmitUsername: (name) => {
      me = name;
      localStorage.setItem("cp-name", name);
      connect();
    },
    onSetKey: (key) => {
      passphrase = key;
      writeRoomFragment(roomId, passphrase);
      panel.appendSystem(
        key
          ? "🔒 Room key set. Share the new link — friends will need to reconnect with it."
          : "🔓 Room key cleared.",
      );
      if (ws) try { ws.close(); } catch {}
    },
    onFollowVideo: (url) => {
      location.assign(url);
    },
  }, me || undefined);

  const video = makeTopFrameAdapter();
  const sync = createSyncClient({
    video,
    send: (m) => send(m),
    isAdmin: () => you === adminId,
    freeForAll: () => freeForAll,
  });

  // Watch for host video changes (same-domain only). Only broadcast if admin.
  const watcher = watchVideoChanges((url) => {
    // Always pin the party fragment so receivers stay in the same room.
    const u = new URL(url);
    const h = new URLSearchParams(u.hash.replace(/^#/, ""));
    h.set("party", roomId);
    if (passphrase) h.set("key", passphrase);
    u.hash = h.toString();
    if (you && you === adminId) {
      const msg: VideoChangeMsg = { type: "videoChange", url: u.toString(), ts: Date.now() };
      send(msg);
    }
  });

  function send(m: WireMsg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }

  function connect() {
    ws = new WebSocket(`${WS_URL}/ws?room=${encodeURIComponent(roomId)}`);
    ws.addEventListener("open", () => {
      const hello: WireMsg = { type: "hello", name: me, pathname: location.pathname, v: 1 };
      if (passphrase) (hello as { passphrase?: string }).passphrase = passphrase;
      send(hello);
    });
    ws.addEventListener("message", (e) => {
      let msg: WireMsg;
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      handle(msg);
    });
    ws.addEventListener("close", () => {
      if (rejected || disposed) return;
      panel.appendSystem("Disconnected. Reconnecting in 2s…");
      setTimeout(connect, 2000);
    });
  }
  if (me) connect();

  void checkForUpdate().then((latest) => {
    if (latest && latest !== `v${VERSION}` && latest !== VERSION) {
      panel.showUpdateBanner(latest, RELEASES_URL);
    }
  });

  function hostName(): string | null {
    return participants.find((p) => p.isAdmin)?.name ?? null;
  }

  function handle(msg: WireMsg) {
    switch (msg.type) {
      case "welcome":
        you = msg.you;
        adminId = msg.adminId;
        freeForAll = msg.freeForAll;
        participants = msg.participants;
        panel.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase });
        if (you === adminId) {
          sync.startHeartbeat();
          panel.appendSystem("You are the admin.");
        }
        if (msg.lastState) sync.applyRemote(msg.lastState);
        return;
      case "participants":
        adminId = msg.adminId;
        participants = msg.participants;
        panel.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase });
        if (you === adminId) sync.startHeartbeat();
        return;
      case "ffa":
        freeForAll = msg.freeForAll;
        panel.appendSystem(`Free-for-all: ${freeForAll ? "ON" : "OFF"}`);
        return;
      case "pathDiff":
        panel.appendSystem(`⚠️ Different content. You: ${msg.yourPath} / Them: ${msg.theirPath}`);
        return;
      case "rejected":
        rejected = true;
        if (ws) try { ws.close(); } catch {}
        panel.appendSystem(
          msg.reason === "passphrase"
            ? "❌ Wrong room key. Get the full share link from whoever set up the room."
            : "❌ Connection rejected.",
        );
        return;
      case "revert":
        sync.revert(msg.at, msg.paused);
        panel.appendSystem("Only the admin can control playback.");
        return;
      case "chat":
        if (msg.from !== you) panel.appendChat(msg.name, msg.text);
        return;
      case "play":
      case "pause":
      case "seek":
      case "state":
        sync.applyRemote(msg);
        return;
      case "videoChange": {
        // Same-host only — anything else is dropped silently.
        if (!sameHost(msg.url)) {
          panel.appendSystem(`⚠️ ${hostName() ?? "Host"} switched to a different site — staying put.`);
          return;
        }
        if (getSettings().auto_follow_video) {
          panel.appendSystem(`▶ Following ${hostName() ?? "host"} to the next video…`);
          location.assign(msg.url);
        } else {
          panel.showFollowToast(msg.url, hostName());
        }
        return;
      }
    }
  }

  let disposed = false;
  function dispose() {
    disposed = true;
    try { watcher.dispose(); } catch {}
    try { sync.dispose(); } catch {}
    if (ws) try { ws.close(); } catch {}
    const host = document.getElementById("avious-party-host");
    if (host?.parentNode) host.parentNode.removeChild(host);
  }

  return {
    dispose,
    statusSnapshot: (): SessionStatus => ({
      inRoom: true,
      isHost: !!you && you === adminId,
      roomUrl: currentRoomUrl(),
      count: participants.length,
      hostName: hostName(),
    }),
    currentUrl: () => currentRoomUrl(),
  };
}

function makeTopFrameAdapter(): VideoAdapter {
  let v: HTMLVideoElement | null = document.querySelector("video");
  let iframe: HTMLIFrameElement | null = null;
  const listeners = new Set<(k: "play" | "pause" | "seek") => void>();
  let lastIframeAt = 0;
  let lastIframePaused = true;

  const mo = new MutationObserver(() => {
    const nv = document.querySelector("video");
    if (nv && nv !== v) {
      v = nv as HTMLVideoElement;
      attach(v);
    }
    const ifr = document.querySelector("iframe");
    if (ifr && ifr !== iframe) iframe = ifr as HTMLIFrameElement;
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  if (v) attach(v);
  iframe = document.querySelector("iframe");

  function attach(el: HTMLVideoElement) {
    const emit = (k: "play" | "pause" | "seek") => listeners.forEach((cb) => cb(k));
    el.addEventListener("play", () => emit("play"));
    el.addEventListener("pause", () => emit("pause"));
    el.addEventListener("seeked", () => emit("seek"));
  }

  window.addEventListener("message", (e: MessageEvent) => {
    const d = e.data;
    if (!d || typeof d !== "object" || !d[IFRAME_TAG]) return;
    if (d.kind === "videoEvent") {
      lastIframeAt = d.at;
      lastIframePaused = d.paused;
      listeners.forEach((cb) => cb(d.event));
    } else if (d.kind === "videoState") {
      lastIframeAt = d.at;
      lastIframePaused = d.paused;
    }
  });

  function postToIframe(payload: object) {
    iframe?.contentWindow?.postMessage({ [IFRAME_TAG]: true, ...payload }, "*");
  }

  setInterval(() => postToIframe({ kind: "queryState" }), 1000);

  return {
    play: () => {
      if (v) v.play().catch(() => {});
      else postToIframe({ kind: "play" });
    },
    pause: () => {
      if (v) v.pause();
      else postToIframe({ kind: "pause" });
    },
    seek: (t) => {
      if (v) v.currentTime = t;
      else postToIframe({ kind: "seek", at: t });
    },
    getTime: () => (v ? v.currentTime : lastIframeAt),
    isPaused: () => (v ? v.paused : lastIframePaused),
    onEvent: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

function loadStoredName(): string | null {
  const n = localStorage.getItem("cp-name");
  return n && n.trim() ? n.slice(0, 32) : null;
}

function readRoomFragment(): { roomId: string | null; passphrase: string | null } {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const id = h.get("party");
  const key = h.get("key");
  return { roomId: id || null, passphrase: key && key.length ? key : null };
}

function roomLinkForCurrent(id: string, passphrase: string | null): string {
  const frag = passphrase ? `party=${id}&key=${encodeURIComponent(passphrase)}` : `party=${id}`;
  return `${location.origin}${location.pathname}${location.search}#${frag}`;
}
function currentRoomUrl(id: string, passphrase: string | null) { return roomLinkForCurrent(id, passphrase); }

function writeRoomFragment(id: string, passphrase: string | null) {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  h.set("party", id);
  if (passphrase) h.set("key", passphrase);
  else h.delete("key");
  history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
}

function randomToken(byteLen: number): string {
  const buf = new Uint8Array(byteLen);
  (crypto.getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256))));
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function checkForUpdate(): Promise<string | null> {
  try {
    const cached = localStorage.getItem("cp-update-check");
    if (cached) {
      const { tag, ts } = JSON.parse(cached) as { tag: string; ts: number };
      if (Date.now() - ts < 6 * 60 * 60 * 1000) return tag;
    }
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { tag_name?: string };
    const tag = json.tag_name ?? null;
    if (tag) localStorage.setItem("cp-update-check", JSON.stringify({ tag, ts: Date.now() }));
    return tag;
  } catch {
    return null;
  }
}

interface RuntimeHandlers {
  onStart: () => string;
  getStatus: () => SessionStatus;
  getCopyLink: () => string;
}

function registerRuntimeMessageHandler(h: RuntimeHandlers) {
  const c = (globalThis as { chrome?: { runtime?: { onMessage?: { addListener: (cb: (msg: unknown, sender: unknown, send: (r: unknown) => void) => boolean | void) => void } } } }).chrome;
  const listener = c?.runtime?.onMessage;
  if (!listener) return;
  listener.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return false;
    const m = msg as { kind?: string };
    switch (m.kind) {
      case "ap.status":
        sendResponse(h.getStatus());
        return true;
      case "ap.start": {
        const url = h.onStart();
        sendResponse({ roomUrl: url });
        return true;
      }
      case "ap.copy":
        sendResponse({ roomUrl: h.getCopyLink() });
        return true;
      case "ap.masterChanged":
        // Trigger re-evaluation by reading settings again.
        void updateSettings({}); // no-op write to fire onSettingsChange via cache update? Skip — onChanged fires naturally.
        return false;
      default:
        return false;
    }
  });
}
