"use strict";
(() => {
  // shared/sync.ts
  var SUPPRESS_MS = 300;
  function createSyncClient(opts) {
    const now = opts.now ?? (() => Date.now());
    const driftThreshold = opts.driftThresholdSec ?? 1.5;
    const heartbeatMs = opts.heartbeatMs ?? 5e3;
    let suppressUntil = 0;
    let heartbeatTimer = null;
    const canEmit = () => opts.isAdmin() || opts.freeForAll();
    const offLocal = opts.video.onEvent((kind) => {
      if (now() < suppressUntil) return;
      if (!canEmit()) return;
      opts.send({ type: kind, at: opts.video.getTime(), ts: now() });
    });
    function applyRemote(msg) {
      suppressUntil = now() + SUPPRESS_MS;
      switch (msg.type) {
        case "play": {
          const drift = Math.abs(opts.video.getTime() - msg.at);
          if (drift > driftThreshold) opts.video.seek(msg.at);
          opts.video.play();
          break;
        }
        case "pause": {
          opts.video.pause();
          const drift = Math.abs(opts.video.getTime() - msg.at);
          if (drift > driftThreshold) opts.video.seek(msg.at);
          break;
        }
        case "seek":
          opts.video.seek(msg.at);
          break;
        case "state": {
          const drift = Math.abs(opts.video.getTime() - msg.at);
          if (drift > driftThreshold) opts.video.seek(msg.at);
          if (msg.paused && !opts.video.isPaused()) opts.video.pause();
          if (!msg.paused && opts.video.isPaused()) opts.video.play();
          break;
        }
      }
    }
    function revert(at, paused) {
      suppressUntil = now() + SUPPRESS_MS;
      opts.video.seek(at);
      if (paused) opts.video.pause();
      else opts.video.play();
    }
    function startHeartbeat() {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (!opts.isAdmin()) return;
        opts.send({
          type: "state",
          at: opts.video.getTime(),
          paused: opts.video.isPaused(),
          ts: now()
        });
      }, heartbeatMs);
    }
    function stopHeartbeat() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
    function dispose() {
      offLocal();
      stopHeartbeat();
    }
    return { applyRemote, revert, startHeartbeat, stopHeartbeat, dispose };
  }

  // client/userscript/iframe-bridge.ts
  var TAG = "__aviousParty__";
  function runIframeBridge() {
    let video = null;
    function findVideo() {
      return document.querySelector("video");
    }
    function bind(v) {
      if (video === v) return;
      video = v;
      const post = (event) => {
        parent.postMessage(
          { [TAG]: true, kind: "videoEvent", event, at: v.currentTime, paused: v.paused },
          "*"
        );
      };
      v.addEventListener("play", () => post("play"));
      v.addEventListener("pause", () => post("pause"));
      v.addEventListener("seeked", () => post("seek"));
    }
    const mo = new MutationObserver(() => {
      const v = findVideo();
      if (v) bind(v);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    const initial = findVideo();
    if (initial) bind(initial);
    window.addEventListener("message", (e) => {
      const data = e.data;
      if (!data || typeof data !== "object" || !data[TAG]) return;
      const m = data;
      const v = video ?? findVideo();
      if (!v) return;
      switch (m.kind) {
        case "play":
          v.play().catch(() => {
          });
          return;
        case "pause":
          v.pause();
          return;
        case "seek":
          v.currentTime = m.at;
          return;
        case "queryState":
          parent.postMessage(
            { [TAG]: true, kind: "videoState", at: v.currentTime, paused: v.paused, hasVideo: true },
            "*"
          );
          return;
      }
    });
  }
  var IFRAME_TAG = TAG;

  // client/userscript/ui/panel.ts
  var SIDEBAR_WIDTH = 320;
  function mountPanel(hooks) {
    const host = document.createElement("div");
    host.id = "avious-party-panel";
    host.style.cssText = `
    position: fixed; top: 0; right: 0; bottom: 0; width: ${SIDEBAR_WIDTH}px;
    background: rgba(20,20,22,0.97); color: #eee; font: 13px system-ui, sans-serif;
    border-left: 1px solid #333; z-index: 2147483647;
    box-shadow: -6px 0 24px rgba(0,0,0,0.5);
    display: flex; flex-direction: column;
    transition: transform 200ms ease;
  `;
    host.innerHTML = `
    <button id="cp-tab" title="Toggle chat" style="
      position:absolute; left:-28px; top:50%; transform:translateY(-50%);
      width:28px; height:56px; background:rgba(20,20,22,0.97); color:#eee;
      border:1px solid #333; border-right:none; border-radius:8px 0 0 8px;
      cursor:pointer; font-size:14px; padding:0;">\u203A</button>
    <div id="cp-header" style="padding:10px 12px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-weight:600;color:#f97316;">\u{1F3AC} Watch-Party</span>
    </div>
    <div style="padding:8px 12px;border-bottom:1px solid #2a2a2a;">
      <button id="cp-copy" style="width:100%;padding:7px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font:inherit;">Copy room link</button>
    </div>
    <div id="cp-ffa-wrap" style="padding:8px 12px;border-bottom:1px solid #2a2a2a;display:none;">
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
        <input type="checkbox" id="cp-ffa"/> Free-for-all controls
      </label>
    </div>
    <div id="cp-people" style="padding:8px 12px;border-bottom:1px solid #2a2a2a;font-size:12px;color:#bbb;max-height:120px;overflow-y:auto;"></div>
    <div id="cp-chat" style="flex:1;overflow-y:auto;padding:10px 12px;font-size:13px;min-height:0;"></div>
    <form id="cp-form" style="display:flex;border-top:1px solid #2a2a2a;">
      <input id="cp-input" placeholder="Type a message\u2026" style="flex:1;padding:10px;background:transparent;border:none;color:#eee;outline:none;font:inherit;"/>
      <button style="background:none;border:none;color:#2563eb;padding:0 12px;cursor:pointer;font:inherit;">Send</button>
    </form>
  `;
    document.body.appendChild(host);
    const $ = (id) => host.querySelector(id);
    let collapsed = false;
    const tab = $("#cp-tab");
    tab.addEventListener("click", () => {
      collapsed = !collapsed;
      host.style.transform = collapsed ? `translateX(${SIDEBAR_WIDTH}px)` : "translateX(0)";
      tab.textContent = collapsed ? "\u2039" : "\u203A";
    });
    $("#cp-copy").addEventListener("click", () => hooks.onCopyLink());
    const ffa = $("#cp-ffa");
    ffa.addEventListener("change", () => hooks.onToggleFFA(ffa.checked));
    const form = $("#cp-form");
    const input = $("#cp-input");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) return;
      hooks.onSendChat(t);
      input.value = "";
    });
    const stop = (e) => e.stopPropagation();
    for (const ev of ["keydown", "keyup", "keypress"]) input.addEventListener(ev, stop);
    function setState(s) {
      const isAdmin = s.you === s.adminId;
      $("#cp-ffa-wrap").style.display = isAdmin ? "block" : "none";
      ffa.checked = s.freeForAll;
      $("#cp-people").innerHTML = s.participants.map((p) => `<div>${p.isAdmin ? "\u{1F451} " : ""}${escapeHtml(p.name)}${p.id === s.you ? " (you)" : ""}</div>`).join("");
    }
    function appendChat(name, text) {
      const div = document.createElement("div");
      div.style.marginBottom = "6px";
      div.innerHTML = `<b style="color:#60a5fa;">${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
      const chat = $("#cp-chat");
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
    function appendSystem(text) {
      const div = document.createElement("div");
      div.style.cssText = "color:#888;font-style:italic;margin-bottom:6px;";
      div.textContent = text;
      const chat = $("#cp-chat");
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
    return { setState, appendChat, appendSystem };
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // client/userscript/main.ts
  var isTopFrame = window === window.top;
  if (!isTopFrame) {
    runIframeBridge();
  } else {
    bootTopFrame();
  }
  function bootTopFrame() {
    const me = ensureName();
    const roomId = ensureRoom();
    const currentRoomUrl = () => roomLinkForCurrent(roomId);
    let you = "";
    let adminId = "";
    let freeForAll = false;
    let ws = null;
    const panel = mountPanel({
      onCopyLink: () => {
        const url = currentRoomUrl();
        navigator.clipboard.writeText(url).then(
          () => panel.appendSystem("Room link copied."),
          () => panel.appendSystem("Copy failed \u2014 link: " + url)
        );
      },
      onToggleFFA: (next) => {
        freeForAll = next;
        send({ type: "ffa", freeForAll: next });
      },
      onSendChat: (text) => {
        send({ type: "chat", from: you, name: me, text, ts: Date.now() });
        panel.appendChat(me, text);
      }
    });
    const video = makeTopFrameAdapter();
    const sync = createSyncClient({
      video,
      send: (m) => send(m),
      isAdmin: () => you === adminId,
      freeForAll: () => freeForAll
    });
    function send(m) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    }
    function connect() {
      ws = new WebSocket(`${"ws://localhost:8787"}/ws?room=${encodeURIComponent(roomId)}`);
      ws.addEventListener("open", () => {
        send({ type: "hello", name: me, pathname: location.pathname, v: 1 });
      });
      ws.addEventListener("message", (e) => {
        let msg;
        try {
          msg = JSON.parse(typeof e.data === "string" ? e.data : "");
        } catch {
          return;
        }
        handle(msg);
      });
      ws.addEventListener("close", () => {
        panel.appendSystem("Disconnected. Reconnecting in 2s\u2026");
        setTimeout(connect, 2e3);
      });
    }
    connect();
    function handle(msg) {
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
          panel.appendSystem(`\u26A0\uFE0F Different content. You: ${msg.yourPath} / Them: ${msg.theirPath}`);
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
  function makeTopFrameAdapter() {
    let v = document.querySelector("video");
    let iframe = null;
    const listeners = /* @__PURE__ */ new Set();
    let lastIframeAt = 0;
    let lastIframePaused = true;
    const mo = new MutationObserver(() => {
      const nv = document.querySelector("video");
      if (nv && nv !== v) {
        v = nv;
        attach(v);
      }
      const ifr = document.querySelector("iframe");
      if (ifr && ifr !== iframe) iframe = ifr;
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    if (v) attach(v);
    iframe = document.querySelector("iframe");
    function attach(el) {
      const emit = (k) => listeners.forEach((cb) => cb(k));
      el.addEventListener("play", () => emit("play"));
      el.addEventListener("pause", () => emit("pause"));
      el.addEventListener("seeked", () => emit("seek"));
    }
    window.addEventListener("message", (e) => {
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
    function postToIframe(payload) {
      iframe?.contentWindow?.postMessage({ [IFRAME_TAG]: true, ...payload }, "*");
    }
    setInterval(() => postToIframe({ kind: "queryState" }), 1e3);
    return {
      play: () => {
        if (v) v.play().catch(() => {
        });
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
      getTime: () => v ? v.currentTime : lastIframeAt,
      isPaused: () => v ? v.paused : lastIframePaused,
      onEvent: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      }
    };
  }
  function ensureName() {
    const k = "cp-name";
    let n = localStorage.getItem(k);
    if (!n) {
      n = (prompt("Watch-Party \u2014 your display name?", "guest") || "guest").slice(0, 32);
      localStorage.setItem(k, n);
    }
    return n;
  }
  function ensureRoom() {
    const m = location.hash.match(/party=([\w-]+)/);
    if (m && m[1]) return m[1];
    const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8);
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    h.set("party", id);
    history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
    return id;
  }
  function roomLinkForCurrent(id) {
    return `${location.origin}${location.pathname}${location.search}#party=${id}`;
  }
})();
