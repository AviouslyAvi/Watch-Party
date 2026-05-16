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
  function mountPanel(hooks, initialUsername) {
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
    <a id="cp-update-banner" href="#" target="_blank" rel="noopener" style="display:none;padding:8px 12px;background:#1e3a8a;color:#dbeafe;font-size:12px;text-decoration:none;border-bottom:1px solid #1d4ed8;">
      <span id="cp-update-text"></span>
    </a>
    <form id="cp-name-form" style="padding:12px;display:none;flex-direction:column;gap:8px;">
      <label style="font-size:12px;color:#bbb;">Pick a display name to join chat</label>
      <input id="cp-name-input" maxlength="32" placeholder="e.g. avi" autocomplete="off" style="padding:8px;background:#111;border:1px solid #333;border-radius:6px;color:#eee;outline:none;font:inherit;"/>
      <button id="cp-name-submit" type="submit" disabled style="padding:8px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;opacity:0.5;">Join chat</button>
    </form>
    <div id="cp-main" style="display:flex;flex-direction:column;flex:1;min-height:0;">
      <div style="padding:8px 12px;border-bottom:1px solid #2a2a2a;display:flex;flex-direction:column;gap:6px;">
        <button id="cp-copy" style="width:100%;padding:7px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font:inherit;">Copy room link</button>
        <button id="cp-share-onboard" title="Sends friends through install steps first" style="width:100%;padding:6px;background:transparent;color:#bbb;border:1px solid #333;border-radius:6px;cursor:pointer;font:inherit;font-size:12px;">Copy onboarding link</button>
      </div>
      <div id="cp-key-wrap" style="padding:8px 12px;border-bottom:1px solid #2a2a2a;display:none;font-size:12px;color:#bbb;">
        <button id="cp-key-toggle" type="button" style="background:none;border:none;color:#bbb;cursor:pointer;padding:0;font:inherit;text-decoration:underline;">\u{1F512} Add room key</button>
        <form id="cp-key-form" style="display:none;flex-direction:column;gap:6px;margin-top:6px;">
          <input id="cp-key-input" maxlength="64" placeholder="Out-of-band secret" autocomplete="off" style="padding:6px;background:#111;border:1px solid #333;border-radius:4px;color:#eee;outline:none;font:inherit;"/>
          <div style="display:flex;gap:6px;">
            <button id="cp-key-save" type="submit" style="flex:1;padding:5px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
            <button id="cp-key-clear" type="button" style="padding:5px 10px;background:#333;color:#eee;border:none;border-radius:4px;cursor:pointer;font:inherit;">Clear</button>
          </div>
          <div style="color:#888;font-size:11px;line-height:1.3;">Friends need the new link to reconnect. Share the key separately for real protection.</div>
        </form>
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
    </div>
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
    $("#cp-share-onboard").addEventListener("click", () => hooks.onShareForNonInstallers());
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
    const nameForm = $("#cp-name-form");
    const nameInput = $("#cp-name-input");
    const nameSubmit = $("#cp-name-submit");
    const mainWrap = $("#cp-main");
    for (const ev of ["keydown", "keyup", "keypress"]) nameInput.addEventListener(ev, stop);
    nameInput.addEventListener("input", () => {
      const ok = nameInput.value.trim().length > 0;
      nameSubmit.disabled = !ok;
      nameSubmit.style.opacity = ok ? "1" : "0.5";
    });
    function revealChat() {
      nameForm.style.display = "none";
      mainWrap.style.display = "flex";
    }
    function showGate() {
      mainWrap.style.display = "none";
      nameForm.style.display = "flex";
      setTimeout(() => nameInput.focus(), 0);
    }
    nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = nameInput.value.trim().slice(0, 32);
      if (!n) return;
      hooks.onSubmitUsername(n);
      revealChat();
    });
    if (!initialUsername) showGate();
    const keyWrap = $("#cp-key-wrap");
    const keyToggle = $("#cp-key-toggle");
    const keyForm = $("#cp-key-form");
    const keyInput = $("#cp-key-input");
    const keyClear = $("#cp-key-clear");
    for (const ev of ["keydown", "keyup", "keypress"]) keyInput.addEventListener(ev, stop);
    keyToggle.addEventListener("click", () => {
      const open = keyForm.style.display !== "none";
      keyForm.style.display = open ? "none" : "flex";
      if (!open) setTimeout(() => keyInput.focus(), 0);
    });
    keyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = keyInput.value.trim().slice(0, 64);
      hooks.onSetKey(v.length ? v : null);
      keyForm.style.display = "none";
    });
    keyClear.addEventListener("click", () => {
      keyInput.value = "";
      hooks.onSetKey(null);
      keyForm.style.display = "none";
    });
    function setState(s) {
      const isAdmin = s.you === s.adminId;
      $("#cp-ffa-wrap").style.display = isAdmin ? "block" : "none";
      keyWrap.style.display = isAdmin ? "block" : "none";
      keyToggle.textContent = s.passphrase ? "\u{1F513} Key set \u2014 change or clear" : "\u{1F512} Add room key";
      keyInput.value = s.passphrase ?? "";
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
    function showUpdateBanner(latestTag, href) {
      const banner = $("#cp-update-banner");
      const text = $("#cp-update-text");
      text.textContent = `Update available: ${latestTag} \u2014 click to download`;
      banner.href = href;
      banner.style.display = "block";
    }
    return { setState, appendChat, appendSystem, revealChat, showUpdateBanner };
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // client/userscript/main.ts
  var isTopFrame = window === window.top;
  var LANDING_ORIGIN = "https://watch-party.pages.dev";
  if (!isTopFrame) {
    runIframeBridge();
  } else {
    if (location.hostname === "watch-party.pages.dev") {
      document.documentElement.dataset.watchPartyInstalled = "1";
    }
    bootTopFrame();
  }
  function bootTopFrame() {
    let me = loadStoredName() ?? "";
    const initial = ensureRoom();
    const roomId = initial.roomId;
    let passphrase = initial.passphrase;
    const currentRoomUrl = () => roomLinkForCurrent(roomId, passphrase);
    let you = "";
    let adminId = "";
    let freeForAll = false;
    let ws = null;
    let rejected = false;
    const panel = mountPanel({
      onCopyLink: () => {
        const url = currentRoomUrl();
        navigator.clipboard.writeText(url).then(
          () => panel.appendSystem("Room link copied."),
          () => panel.appendSystem("Copy failed \u2014 link: " + url)
        );
      },
      onShareForNonInstallers: () => {
        const url = wrapperLinkFor(currentRoomUrl(), roomId, passphrase);
        navigator.clipboard.writeText(url).then(
          () => panel.appendSystem("Onboarding link copied \u2014 friends without the extension will see install steps."),
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
          key ? "\u{1F512} Room key set. Share the new link \u2014 friends will need to reconnect with it." : "\u{1F513} Room key cleared."
        );
        if (ws) try {
          ws.close();
        } catch {
        }
      }
    }, me || void 0);
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
      ws = new WebSocket(`${"wss://avious-party-relay.avibenabram.workers.dev"}/ws?room=${encodeURIComponent(roomId)}`);
      ws.addEventListener("open", () => {
        const hello = { type: "hello", name: me, pathname: location.pathname, v: 1 };
        if (passphrase) hello.passphrase = passphrase;
        send(hello);
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
        if (rejected) return;
        panel.appendSystem("Disconnected. Reconnecting in 2s\u2026");
        setTimeout(connect, 2e3);
      });
    }
    if (me) connect();
    checkForUpdate().then((latest) => {
      if (latest && latest !== `v${"0.3.1"}` && latest !== "0.3.1") {
        panel.showUpdateBanner(latest, "https://github.com/AviouslyAvi/Watch-Party/releases/latest");
      }
    });
    function handle(msg) {
      switch (msg.type) {
        case "welcome":
          you = msg.you;
          adminId = msg.adminId;
          freeForAll = msg.freeForAll;
          panel.setState({ you, adminId, freeForAll, participants: msg.participants, roomUrl: currentRoomUrl(), passphrase });
          if (you === adminId) {
            sync.startHeartbeat();
            panel.appendSystem("You are the admin.");
          }
          if (msg.lastState) sync.applyRemote(msg.lastState);
          return;
        case "participants":
          adminId = msg.adminId;
          panel.setState({ you, adminId, freeForAll, participants: msg.participants, roomUrl: currentRoomUrl(), passphrase });
          if (you === adminId) sync.startHeartbeat();
          return;
        case "ffa":
          freeForAll = msg.freeForAll;
          panel.appendSystem(`Free-for-all: ${freeForAll ? "ON" : "OFF"}`);
          return;
        case "pathDiff":
          panel.appendSystem(`\u26A0\uFE0F Different content. You: ${msg.yourPath} / Them: ${msg.theirPath}`);
          return;
        case "rejected":
          rejected = true;
          if (ws) try {
            ws.close();
          } catch {
          }
          panel.appendSystem(
            msg.reason === "passphrase" ? "\u274C Wrong room key. Get the full share link from whoever set up the room." : "\u274C Connection rejected."
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
  function loadStoredName() {
    const n = localStorage.getItem("cp-name");
    return n && n.trim() ? n.slice(0, 32) : null;
  }
  function ensureRoom() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const existing = h.get("party");
    const key = h.get("key");
    if (existing) {
      return { roomId: existing, passphrase: key && key.length ? key : null };
    }
    const id = randomToken(16);
    h.set("party", id);
    history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
    return { roomId: id, passphrase: null };
  }
  function roomLinkForCurrent(id, passphrase) {
    const frag = passphrase ? `party=${id}&key=${encodeURIComponent(passphrase)}` : `party=${id}`;
    return `${location.origin}${location.pathname}${location.search}#${frag}`;
  }
  function wrapperLinkFor(videoLink, id, passphrase) {
    const bare = videoLink.split("#")[0] ?? videoLink;
    const v = base64urlEncode(bare);
    const parts = [`v=${v}`, `party=${id}`];
    if (passphrase) parts.push(`key=${encodeURIComponent(passphrase)}`);
    return `${LANDING_ORIGIN}/#${parts.join("&")}`;
  }
  function base64urlEncode(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function writeRoomFragment(id, passphrase) {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    h.set("party", id);
    if (passphrase) h.set("key", passphrase);
    else h.delete("key");
    history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
  }
  function randomToken(byteLen) {
    const buf = new Uint8Array(byteLen);
    crypto.getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => buf[i] = Math.floor(Math.random() * 256));
    let s = "";
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function checkForUpdate() {
    try {
      const cached = localStorage.getItem("cp-update-check");
      if (cached) {
        const { tag: tag2, ts } = JSON.parse(cached);
        if (Date.now() - ts < 6 * 60 * 60 * 1e3) return tag2;
      }
      const res = await fetch("https://api.github.com/repos/AviouslyAvi/Watch-Party/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return null;
      const json = await res.json();
      const tag = json.tag_name ?? null;
      if (tag) localStorage.setItem("cp-update-check", JSON.stringify({ tag, ts: Date.now() }));
      return tag;
    } catch {
      return null;
    }
  }
})();
