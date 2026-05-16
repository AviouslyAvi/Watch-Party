import { createSyncClient, type VideoAdapter } from "../../shared/sync";
import type { WireMsg, SyncMsg } from "../../shared/protocol";
import { runIframeBridge, IFRAME_TAG } from "./iframe-bridge";
import { mountPanel } from "./ui/panel";

declare const WS_URL: string;
declare const VERSION: string;
declare const RELEASES_API: string;
declare const RELEASES_URL: string;

const isTopFrame = window === window.top;

if (!isTopFrame) {
  runIframeBridge();
} else {
  bootTopFrame();
}

function bootTopFrame() {
  let me = loadStoredName() ?? "";
  const roomId = ensureRoom();
  const currentRoomUrl = () => roomLinkForCurrent(roomId);

  let you = "";
  let adminId = "";
  let freeForAll = false;
  let ws: WebSocket | null = null;

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
      panel.appendChat(me, text);
    },
    onSubmitUsername: (name) => {
      me = name;
      localStorage.setItem("cp-name", name);
      connect();
    },
  }, me || undefined);

  const video = makeTopFrameAdapter();
  const sync = createSyncClient({
    video,
    send: (m) => send(m),
    isAdmin: () => you === adminId,
    freeForAll: () => freeForAll,
  });

  function send(m: WireMsg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }

  function connect() {
    ws = new WebSocket(`${WS_URL}/ws?room=${encodeURIComponent(roomId)}`);
    ws.addEventListener("open", () => {
      send({ type: "hello", name: me, pathname: location.pathname, v: 1 });
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
      panel.appendSystem("Disconnected. Reconnecting in 2s…");
      setTimeout(connect, 2000);
    });
  }
  if (me) connect();

  checkForUpdate().then((latest) => {
    if (latest && latest !== `v${VERSION}` && latest !== VERSION) {
      panel.showUpdateBanner(latest, RELEASES_URL);
    }
  });

  function handle(msg: WireMsg) {
    switch (msg.type) {
      case "welcome":
        you = msg.you;
        adminId = msg.adminId;
        freeForAll = msg.freeForAll;
        panel.setState({ you, adminId, freeForAll, participants: msg.participants, roomUrl: currentRoomUrl() });
        if (you === adminId) {
          sync.startHeartbeat();
          panel.appendSystem("You are the admin.");
        }
        if (msg.lastState) sync.applyRemote(msg.lastState);
        return;
      case "participants":
        adminId = msg.adminId;
        panel.setState({ you, adminId, freeForAll, participants: msg.participants, roomUrl: currentRoomUrl() });
        if (you === adminId) sync.startHeartbeat();
        return;
      case "ffa":
        freeForAll = msg.freeForAll;
        panel.appendSystem(`Free-for-all: ${freeForAll ? "ON" : "OFF"}`);
        return;
      case "pathDiff":
        panel.appendSystem(`⚠️ Different content. You: ${msg.yourPath} / Them: ${msg.theirPath}`);
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
    }
  }
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

function ensureRoom(): string {
  const m = location.hash.match(/party=([\w-]+)/);
  if (m && m[1]) return m[1];
  const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8);
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  h.set("party", id);
  history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
  return id;
}

function roomLinkForCurrent(id: string): string {
  return `${location.origin}${location.pathname}${location.search}#party=${id}`;
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
