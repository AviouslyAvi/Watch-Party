"use strict";
(() => {
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

  // shared/protocol.ts
  var REACTION_EMOJIS = ["\u2764\uFE0F", "\u{1F602}", "\u{1F525}", "\u{1F44F}", "\u{1F62E}", "\u{1F440}"];

  // client/userscript/ui/peer-color.ts
  var WONG_PALETTE = [
    "#E69F00",
    // orange
    "#56B4E9",
    // sky blue
    "#009E73",
    // bluish green
    "#F0E442",
    // yellow
    "#0072B2",
    // blue
    "#D55E00",
    // vermillion
    "#CC79A7",
    // reddish purple
    "#ffffff"
    // white-ish (replaces black so it stays visible on dark bg)
  ];
  function fnv1a(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function colorFor(id, mode = "none") {
    const h = fnv1a(id);
    if (mode === "none") {
      const hue = h % 360;
      return `hsl(${hue}, 70%, 65%)`;
    }
    return WONG_PALETTE[h % WONG_PALETTE.length];
  }

  // client/userscript/ui/panel.ts
  var REACTION_FLOAT_MAX = 5;
  var REACTION_FLOAT_MS = 2e3;
  var REACTION_SEND_THROTTLE_MS = 2e3;
  var TYPING_DECAY_MS = 3e3;
  var TYPING_SEND_THROTTLE_MS = 1500;
  var SIDEBAR_WIDTH = 320;
  var DEFAULTS = {
    layoutMode: "overlay",
    bgColor: "#141416",
    textColor: "#eeeeee",
    opacity: 0.88,
    fontSize: 13,
    colorblind: "none",
    highContrast: false,
    showTimestamps: false
  };
  var SETTINGS_KEY = "cp-settings-v1";
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
    }
  }
  function mountPanel(hooks, initialUsername) {
    let settings = loadSettings();
    const host = document.createElement("div");
    host.id = "avious-party-panel";
    host.style.cssText = `
    position: fixed; top: 0; right: 0; bottom: 0; width: ${SIDEBAR_WIDTH}px;
    font: var(--cp-font-size, 13px) system-ui, sans-serif;
    color: var(--cp-text, #eee);
    background: color-mix(in srgb, var(--cp-bg, #141416) calc(var(--cp-bg-opacity, 0.88) * 100%), transparent);
    backdrop-filter: blur(6px);
    border-left: 1px solid #333; z-index: 2147483647;
    box-shadow: -6px 0 24px rgba(0,0,0,0.5);
    display: flex; flex-direction: column;
    transition: transform 200ms ease;
  `;
    host.innerHTML = `
    <button id="cp-tab" title="Toggle chat" style="
      position:absolute; left:-28px; top:50%; transform:translateY(-50%);
      width:28px; height:56px; background:var(--cp-bg,#141416); color:var(--cp-text,#eee);
      border:1px solid #333; border-right:none; border-radius:8px 0 0 8px;
      cursor:pointer; font-size:14px; padding:0;">\u203A</button>
    <div id="cp-header" style="padding:10px 12px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="font-weight:600;color:#f97316;">\u{1F3AC} Watch-Party</span>
      <div style="display:flex;gap:4px;align-items:center;">
        <div id="cp-layout-modes" style="display:flex;gap:2px;border:1px solid #2a2a2a;border-radius:6px;overflow:hidden;">
          <button type="button" data-mode="overlay" class="cp-mode-btn" title="Overlay the chat on top of the page" style="background:transparent;color:#bbb;border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">\u29C9</button>
          <button type="button" data-mode="push" class="cp-mode-btn" title="Push the page over to make room" style="background:transparent;color:#bbb;border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">\u21E4</button>
          <button type="button" data-mode="hidden" class="cp-mode-btn" title="Hide the chat (tab stays visible)" style="background:transparent;color:#bbb;border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">\u2304</button>
        </div>
        <button id="cp-settings-btn" title="Settings" style="background:transparent;color:#bbb;border:1px solid #2a2a2a;border-radius:6px;padding:3px 6px;cursor:pointer;font:inherit;font-size:13px;line-height:1;">\u2699</button>
      </div>
    </div>
    <a id="cp-update-banner" href="#" target="_blank" rel="noopener" style="display:none;padding:8px 12px;background:#1e3a8a;color:#dbeafe;font-size:12px;text-decoration:none;border-bottom:1px solid #1d4ed8;">
      <span id="cp-update-text"></span>
    </a>
    <div id="cp-settings-drawer" style="display:none;padding:10px 12px;border-bottom:1px solid #333;background:rgba(0,0,0,0.2);max-height:50vh;overflow-y:auto;font-size:12px;"></div>
    <form id="cp-name-form" style="padding:12px;display:none;flex-direction:column;gap:8px;">
      <label style="font-size:12px;color:#bbb;">Pick a display name to join chat</label>
      <input id="cp-name-input" maxlength="32" placeholder="e.g. avi" autocomplete="off" style="padding:8px;background:#111;border:1px solid #333;border-radius:6px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
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
          <input id="cp-key-input" maxlength="64" placeholder="Out-of-band secret" autocomplete="off" style="padding:6px;background:#111;border:1px solid #333;border-radius:4px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
          <div style="display:flex;gap:6px;">
            <button id="cp-key-save" type="submit" style="flex:1;padding:5px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
            <button id="cp-key-clear" type="button" style="padding:5px 10px;background:#333;color:var(--cp-text,#eee);border:none;border-radius:4px;cursor:pointer;font:inherit;">Clear</button>
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
      <div id="cp-chat-wrap" style="flex:1;position:relative;display:flex;flex-direction:column;min-height:0;">
        <div id="cp-chat" style="flex:1;overflow-y:auto;padding:10px 12px;font-size:inherit;min-height:0;"></div>
        <div id="cp-reactions-float" style="position:absolute;left:0;right:0;bottom:0;height:0;pointer-events:none;overflow:visible;"></div>
      </div>
      <div id="cp-reactions" style="display:flex;gap:4px;padding:6px 12px;border-top:1px solid #2a2a2a;background:rgba(0,0,0,0.15);transition:opacity 200ms;">
        ${REACTION_EMOJIS.map(
      (e) => `<button type="button" data-emoji="${e}" class="cp-react-btn" style="flex:1;padding:4px 0;background:transparent;border:1px solid #2a2a2a;border-radius:6px;cursor:pointer;font-size:16px;line-height:1;">${e}</button>`
    ).join("")}
      </div>
      <div id="cp-typing" style="height:16px;padding:0 12px;font-size:11px;color:#888;opacity:0;transition:opacity 200ms;line-height:16px;"></div>
      <form id="cp-form" style="display:flex;border-top:1px solid #2a2a2a;">
        <input id="cp-input" placeholder="Type a message\u2026" style="flex:1;padding:10px;background:transparent;border:none;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
        <button style="background:none;border:none;color:#2563eb;padding:0 12px;cursor:pointer;font:inherit;">Send</button>
      </form>
    </div>
  `;
    document.body.appendChild(host);
    if (!document.getElementById("cp-keyframes")) {
      const styleEl = document.createElement("style");
      styleEl.id = "cp-keyframes";
      styleEl.textContent = `
      @keyframes cp-float-up {
        0% { transform: translate(-50%, 0); opacity: 0; }
        15% { opacity: 1; }
        85% { opacity: 1; }
        100% { transform: translate(-50%, -120px); opacity: 0; }
      }
      .cp-react-btn:hover { background:#222 !important; border-color:#444 !important; }
      .cp-react-btn:active { transform: scale(0.92); }
      .cp-mode-btn[data-active="1"] { background:#2a2a2a !important; color:#f97316 !important; }
      #avious-party-panel.cp-high-contrast { --cp-bg: #000 !important; --cp-text: #fff !important; --cp-bg-opacity: 1 !important; }
      .cp-people-row { display:flex; align-items:center; gap:6px; padding:2px 0; }
      .cp-people-row button.cp-op-btn { background:transparent;border:1px solid #333;border-radius:4px;color:#bbb;padding:1px 6px;cursor:pointer;font-size:10px; }
      .cp-people-row button.cp-op-btn:hover { background:#222;border-color:#444; }
    `;
      document.head.appendChild(styleEl);
    }
    const $ = (id) => host.querySelector(id);
    const ORIGINAL_MARGIN_RIGHT_KEY = "__cp_orig_margin_right";
    function applyLayout(mode) {
      const docEl = document.documentElement;
      const cached = docEl;
      if (cached[ORIGINAL_MARGIN_RIGHT_KEY] === void 0) {
        cached[ORIGINAL_MARGIN_RIGHT_KEY] = docEl.style.marginRight;
      }
      docEl.style.transition = "margin-right 200ms ease";
      if (mode === "push") {
        docEl.style.marginRight = `${SIDEBAR_WIDTH}px`;
        host.style.transform = "translateX(0)";
      } else if (mode === "hidden") {
        docEl.style.marginRight = cached[ORIGINAL_MARGIN_RIGHT_KEY] ?? "";
        host.style.transform = `translateX(${SIDEBAR_WIDTH}px)`;
      } else {
        docEl.style.marginRight = cached[ORIGINAL_MARGIN_RIGHT_KEY] ?? "";
        host.style.transform = "translateX(0)";
      }
      Array.from(host.querySelectorAll(".cp-mode-btn")).forEach((btn) => {
        btn.dataset.active = btn.dataset.mode === mode ? "1" : "0";
      });
      const tab = $("#cp-tab");
      tab.textContent = mode === "hidden" ? "\u2039" : "\u203A";
    }
    function setLayoutMode(mode, persist = true) {
      settings.layoutMode = mode;
      if (persist) saveSettings(settings);
      applyLayout(mode);
    }
    Array.from(host.querySelectorAll(".cp-mode-btn")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mode;
        if (m) setLayoutMode(m);
      });
    });
    $("#cp-tab").addEventListener("click", () => {
      setLayoutMode(settings.layoutMode === "hidden" ? "overlay" : "hidden");
    });
    let preFullscreenMode = null;
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        if (settings.layoutMode !== "hidden") {
          preFullscreenMode = settings.layoutMode;
          applyLayout("hidden");
        }
      } else if (preFullscreenMode) {
        applyLayout(preFullscreenMode);
        preFullscreenMode = null;
      }
    });
    function applyTheme() {
      host.style.setProperty("--cp-bg", settings.bgColor);
      host.style.setProperty("--cp-text", settings.textColor);
      host.style.setProperty("--cp-bg-opacity", String(settings.opacity));
      host.style.setProperty("--cp-font-size", `${settings.fontSize}px`);
      host.classList.toggle("cp-high-contrast", settings.highContrast);
      rerenderPeopleList();
      rerenderChatColors();
    }
    function renderSettingsDrawer() {
      const drawer = $("#cp-settings-drawer");
      drawer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:#bbb;">Display name</div>
          <form id="cp-rename-form" style="display:flex;gap:6px;">
            <input id="cp-rename-input" maxlength="32" value="${escapeAttr(currentName)}" style="flex:1;padding:5px;background:#111;border:1px solid #333;border-radius:4px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
            <button type="submit" style="padding:5px 8px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
          </form>
        </section>
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:#bbb;">Appearance</div>
          <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span>Background</span>
            <input type="color" id="cp-set-bg" value="${settings.bgColor}"/>
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span>Text</span>
            <input type="color" id="cp-set-text" value="${settings.textColor}"/>
          </label>
          <label style="display:block;margin-bottom:6px;">
            <span>Opacity: <span id="cp-opacity-val">${settings.opacity.toFixed(2)}</span></span>
            <input type="range" id="cp-set-opacity" min="0.6" max="1" step="0.02" value="${settings.opacity}" style="width:100%;"/>
          </label>
          <label style="display:block;margin-bottom:6px;">
            <span>Text size: <span id="cp-fs-val">${settings.fontSize}</span>px</span>
            <input type="range" id="cp-set-fs" min="11" max="18" step="1" value="${settings.fontSize}" style="width:100%;"/>
          </label>
        </section>
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:#bbb;">Accessibility</div>
          <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span>Colorblind mode</span>
            <select id="cp-set-cb" style="background:#111;border:1px solid #333;color:var(--cp-text,#eee);padding:3px;border-radius:4px;font:inherit;">
              <option value="none">None</option>
              <option value="deuter">Deuteranopia</option>
              <option value="protan">Protanopia</option>
              <option value="tritan">Tritanopia</option>
            </select>
          </label>
          <label style="display:flex;gap:6px;align-items:center;margin-bottom:6px;cursor:pointer;">
            <input type="checkbox" id="cp-set-hc" ${settings.highContrast ? "checked" : ""}/> High contrast
          </label>
          <label style="display:flex;gap:6px;align-items:center;margin-bottom:6px;cursor:pointer;">
            <input type="checkbox" id="cp-set-ts" ${settings.showTimestamps ? "checked" : ""}/> Show timestamps in chat
          </label>
        </section>
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:#bbb;">Behavior</div>
          <button id="cp-replay-tour" style="width:100%;padding:5px;background:#333;color:var(--cp-text,#eee);border:none;border-radius:4px;cursor:pointer;font:inherit;">Replay onboarding tour</button>
        </section>
        <section style="font-size:11px;color:#777;border-top:1px solid #2a2a2a;padding-top:8px;">
          Watch-Party. Room data lives in memory only \u2014 close the tab to leave.
        </section>
      </div>
    `;
      $("#cp-set-bg").addEventListener("input", (e) => {
        settings.bgColor = e.target.value;
        saveSettings(settings);
        applyTheme();
      });
      $("#cp-set-text").addEventListener("input", (e) => {
        settings.textColor = e.target.value;
        saveSettings(settings);
        applyTheme();
      });
      const opacityInput = $("#cp-set-opacity");
      opacityInput.addEventListener("input", () => {
        settings.opacity = parseFloat(opacityInput.value);
        $("#cp-opacity-val").textContent = settings.opacity.toFixed(2);
        saveSettings(settings);
        applyTheme();
      });
      const fsInput = $("#cp-set-fs");
      fsInput.addEventListener("input", () => {
        settings.fontSize = parseInt(fsInput.value, 10);
        $("#cp-fs-val").textContent = String(settings.fontSize);
        saveSettings(settings);
        applyTheme();
      });
      const cbSelect = $("#cp-set-cb");
      cbSelect.value = settings.colorblind;
      cbSelect.addEventListener("change", () => {
        settings.colorblind = cbSelect.value;
        saveSettings(settings);
        applyTheme();
      });
      $("#cp-set-hc").addEventListener("change", (e) => {
        settings.highContrast = e.target.checked;
        saveSettings(settings);
        applyTheme();
      });
      $("#cp-set-ts").addEventListener("change", (e) => {
        settings.showTimestamps = e.target.checked;
        saveSettings(settings);
        rerenderTimestamps();
      });
      $("#cp-replay-tour").addEventListener("click", () => {
        hooks.onReplayOnboarding();
      });
      const renameForm = $("#cp-rename-form");
      const renameInput = $("#cp-rename-input");
      for (const ev of ["keydown", "keyup", "keypress"]) renameInput.addEventListener(ev, stop);
      renameForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = renameInput.value.trim().slice(0, 32);
        if (!v || v === currentName) return;
        hooks.onRename(v);
      });
    }
    $("#cp-settings-btn").addEventListener("click", () => {
      const drawer = $("#cp-settings-drawer");
      const open = drawer.style.display !== "none";
      if (open) {
        drawer.style.display = "none";
      } else {
        renderSettingsDrawer();
        drawer.style.display = "block";
      }
    });
    setLayoutMode(settings.layoutMode, false);
    applyTheme();
    const reactionsBar = $("#cp-reactions");
    let lastReactionSent = 0;
    let reactionThrottleTimer = null;
    function flashReactionThrottle() {
      reactionsBar.style.opacity = "0.4";
      reactionsBar.style.pointerEvents = "none";
      if (reactionThrottleTimer !== null) clearTimeout(reactionThrottleTimer);
      reactionThrottleTimer = window.setTimeout(() => {
        reactionsBar.style.opacity = "1";
        reactionsBar.style.pointerEvents = "auto";
        reactionThrottleTimer = null;
      }, REACTION_SEND_THROTTLE_MS);
    }
    reactionsBar.addEventListener("click", (e) => {
      const t = e.target;
      const btn = t.closest(".cp-react-btn");
      if (!btn) return;
      const emoji = btn.dataset.emoji;
      if (!emoji) return;
      const now = Date.now();
      if (now - lastReactionSent < REACTION_SEND_THROTTLE_MS) {
        flashReactionThrottle();
        return;
      }
      lastReactionSent = now;
      hooks.onReact(emoji);
      flashReactionThrottle();
    });
    const floatLayer = $("#cp-reactions-float");
    function showReaction(id, name, emoji) {
      while (floatLayer.children.length >= REACTION_FLOAT_MAX) {
        floatLayer.firstChild?.remove();
      }
      const el = document.createElement("div");
      const offset = Math.floor(Math.random() * 120) - 60;
      el.style.cssText = `
      position:absolute; left:calc(50% + ${offset}px); bottom:4px;
      transform:translate(-50%,0); font-size:22px; line-height:1;
      animation: cp-float-up ${REACTION_FLOAT_MS}ms ease-out forwards;
      white-space:nowrap; text-shadow:0 1px 2px rgba(0,0,0,0.7);
    `;
      el.innerHTML = `<span>${emoji}</span> <span style="font-size:11px;color:${colorFor(id, settings.colorblind)};">${escapeHtml(name)}</span>`;
      floatLayer.appendChild(el);
      setTimeout(() => el.remove(), REACTION_FLOAT_MS + 50);
    }
    let collapsed = settings.layoutMode === "hidden";
    void collapsed;
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
    let lastTypingSent = 0;
    input.addEventListener("input", () => {
      if (!input.value) return;
      const now = Date.now();
      if (now - lastTypingSent > TYPING_SEND_THROTTLE_MS) {
        lastTypingSent = now;
        hooks.onTyping();
      }
    });
    const typingEl = $("#cp-typing");
    const typers = /* @__PURE__ */ new Map();
    function renderTyping() {
      const entries = [...typers.entries()];
      typingEl.innerHTML = "";
      if (entries.length >= 3) {
        typingEl.textContent = "Several people are typing\u2026";
      } else if (entries.length > 0) {
        const nameSpan = (id, name) => `<span style="color:${colorFor(id, settings.colorblind)};">${escapeHtml(name)}</span>`;
        if (entries.length === 1) {
          const e0 = entries[0];
          if (e0) typingEl.innerHTML = `${nameSpan(e0[0], e0[1].name)} is typing\u2026`;
        } else {
          const e0 = entries[0];
          const e1 = entries[1];
          if (e0 && e1) typingEl.innerHTML = `${nameSpan(e0[0], e0[1].name)} and ${nameSpan(e1[0], e1[1].name)} are typing\u2026`;
        }
      }
      typingEl.style.opacity = entries.length > 0 ? "1" : "0";
    }
    function showTyping(from, name) {
      const existing = typers.get(from);
      if (existing) clearTimeout(existing.timeoutId);
      const timeoutId = window.setTimeout(() => {
        typers.delete(from);
        renderTyping();
      }, TYPING_DECAY_MS);
      typers.set(from, { name, timeoutId });
      renderTyping();
    }
    let currentName = initialUsername ?? "";
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
      currentName = n;
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
    let currentParticipants = [];
    let currentYou = "";
    let currentAdminId = "";
    const nameMap = /* @__PURE__ */ new Map();
    function rerenderPeopleList() {
      const peopleEl = $("#cp-people");
      const youIsAdmin = currentYou === currentAdminId;
      peopleEl.innerHTML = currentParticipants.map((p) => {
        const isYou = p.id === currentYou;
        const adminBadge = p.isAdmin ? "\u{1F451} " : "";
        const opBadge = !p.isAdmin && p.isOperator ? "\u2B50 " : "";
        const youTag = isYou ? " (you)" : "";
        const action = youIsAdmin && !isYou && !p.isAdmin ? p.isOperator ? `<button class="cp-op-btn" data-action="demote" data-target="${p.id}">remove \u2B50</button>` : `<button class="cp-op-btn" data-action="promote" data-target="${p.id}">give \u2B50</button>` : "";
        return `<div class="cp-people-row">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${adminBadge}${opBadge}<span style="color:${colorFor(p.id, settings.colorblind)};">${escapeHtml(p.name)}</span>${youTag}
          </span>
          ${action}
        </div>`;
      }).join("");
      Array.from(peopleEl.querySelectorAll(".cp-op-btn")).forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.target;
          if (!target) return;
          if (btn.dataset.action === "promote") hooks.onPromote(target);
          else hooks.onDemote(target);
        });
      });
    }
    function setState(s) {
      currentYou = s.you;
      currentAdminId = s.adminId;
      currentParticipants = s.participants;
      for (const p of s.participants) nameMap.set(p.id, p.name);
      const youParticipant = s.participants.find((p) => p.id === s.you);
      if (youParticipant && youParticipant.name !== currentName) {
        currentName = youParticipant.name;
      }
      const isAdmin = s.you === s.adminId;
      $("#cp-ffa-wrap").style.display = isAdmin ? "block" : "none";
      keyWrap.style.display = isAdmin ? "block" : "none";
      keyToggle.textContent = s.passphrase ? "\u{1F513} Key set \u2014 change or clear" : "\u{1F512} Add room key";
      keyInput.value = s.passphrase ?? "";
      ffa.checked = s.freeForAll;
      rerenderPeopleList();
      rerenderChatColors();
    }
    const chatLog = [];
    function fmtTs(ts) {
      const d = new Date(ts);
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    }
    function renderChatLine(rec) {
      const liveName = nameMap.get(rec.from) ?? "\u2026";
      const tsPart = settings.showTimestamps ? `<span class="cp-ts" style="color:#666;font-size:10px;margin-right:6px;">${fmtTs(rec.ts)}</span>` : "";
      rec.el.innerHTML = `${tsPart}<b data-cp-from="${rec.from}" style="color:${colorFor(rec.from, settings.colorblind)};">${escapeHtml(liveName)}</b>: ${escapeHtml(rec.text)}`;
    }
    function appendChat(id, name, text, ts = Date.now()) {
      nameMap.set(id, name);
      const div = document.createElement("div");
      div.style.marginBottom = "6px";
      div.dataset.cpRecord = "1";
      const rec = { el: div, from: id, text, ts };
      chatLog.push(rec);
      renderChatLine(rec);
      const chat = $("#cp-chat");
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
    function applyRename(id, name) {
      nameMap.set(id, name);
      for (const rec of chatLog) {
        if (rec.from === id) renderChatLine(rec);
      }
    }
    function rerenderChatColors() {
      for (const rec of chatLog) renderChatLine(rec);
    }
    function rerenderTimestamps() {
      for (const rec of chatLog) renderChatLine(rec);
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
    function destroy() {
      for (const t of typers.values()) clearTimeout(t.timeoutId);
      typers.clear();
      if (reactionThrottleTimer !== null) clearTimeout(reactionThrottleTimer);
      const docEl = document.documentElement;
      const cached = docEl[ORIGINAL_MARGIN_RIGHT_KEY];
      if (cached !== void 0) docEl.style.marginRight = cached;
      host.remove();
    }
    return {
      setState,
      appendChat,
      appendSystem,
      revealChat,
      showUpdateBanner,
      showReaction,
      showTyping,
      applyRename,
      setLayoutMode,
      destroy,
      host,
      // Selectors useful for the onboarding coachmark.
      anchors: {
        header: () => $("#cp-header"),
        copy: () => $("#cp-copy"),
        nameForm: () => $("#cp-name-form"),
        reactions: () => $("#cp-reactions"),
        layout: () => $("#cp-layout-modes"),
        settings: () => $("#cp-settings-btn")
      }
    };
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // client/userscript/ui/coachmark.ts
  var ONBOARDED_KEY = "cp-onboarded-v1";
  function hasOnboarded() {
    try {
      return localStorage.getItem(ONBOARDED_KEY) === "1";
    } catch {
      return false;
    }
  }
  function markOnboarded() {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
    }
  }
  function resetOnboarded() {
    try {
      localStorage.removeItem(ONBOARDED_KEY);
    } catch {
    }
  }
  function runCoachmark(steps) {
    if (steps.length === 0) return;
    const refs = buildOverlay();
    let i = 0;
    function cleanup() {
      refs.backdrop.remove();
      refs.tooltip.remove();
      refs.spotlight.remove();
      document.removeEventListener("keydown", onKey);
    }
    function finish() {
      markOnboarded();
      cleanup();
    }
    function render() {
      const step = steps[i];
      if (!step) return finish();
      const anchorEl = step.anchor();
      if (!anchorEl) {
        i++;
        return render();
      }
      placeSpotlight(refs.spotlight, anchorEl);
      placeTooltip(refs.tooltip, anchorEl, step.placement ?? "auto", step.text, {
        stepIndex: i,
        stepCount: steps.length,
        next: () => {
          i++;
          if (i >= steps.length) finish();
          else render();
        },
        skip: finish
      });
    }
    function onKey(e) {
      if (e.key === "Escape") finish();
    }
    document.addEventListener("keydown", onKey);
    render();
  }
  function buildOverlay() {
    const backdrop = document.createElement("div");
    backdrop.id = "cp-coach-backdrop";
    backdrop.style.cssText = `
    position:fixed;inset:0;z-index:2147483645;
    background:rgba(0,0,0,0.6);
    pointer-events:auto;
  `;
    document.body.appendChild(backdrop);
    const spotlight = document.createElement("div");
    spotlight.id = "cp-coach-spotlight";
    spotlight.style.cssText = `
    position:fixed;z-index:2147483646;pointer-events:none;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.65);
    border-radius:8px;transition:all 200ms ease;
  `;
    document.body.appendChild(spotlight);
    const tooltip = document.createElement("div");
    tooltip.id = "cp-coach-tooltip";
    tooltip.style.cssText = `
    position:fixed;z-index:2147483647;
    background:#141416;color:#eee;
    border:1px solid #333;border-radius:8px;
    padding:12px 14px;max-width:280px;
    font:13px system-ui,sans-serif;line-height:1.4;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
  `;
    document.body.appendChild(tooltip);
    backdrop.addEventListener("click", (e) => e.stopPropagation());
    return { backdrop, tooltip, spotlight };
  }
  function placeSpotlight(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const pad = 6;
    el.style.left = `${r.left - pad}px`;
    el.style.top = `${r.top - pad}px`;
    el.style.width = `${r.width + pad * 2}px`;
    el.style.height = `${r.height + pad * 2}px`;
  }
  function placeTooltip(el, anchor, placement, text, ctx) {
    el.innerHTML = `
    <div style="margin-bottom:10px;">${text}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="color:#888;font-size:11px;">${ctx.stepIndex + 1} / ${ctx.stepCount}</span>
      <div style="display:flex;gap:6px;">
        <button id="cp-coach-skip" style="background:transparent;color:#bbb;border:1px solid #333;border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit;">Skip</button>
        <button id="cp-coach-next" style="background:#f97316;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font:inherit;font-weight:600;">${ctx.stepIndex === ctx.stepCount - 1 ? "Done" : "Next"}</button>
      </div>
    </div>
  `;
    el.style.left = "-9999px";
    el.style.top = "0";
    requestAnimationFrame(() => {
      const r = anchor.getBoundingClientRect();
      const tr = el.getBoundingClientRect();
      let pick = placement === "auto" ? "left" : placement;
      if (placement === "auto" && r.left < tr.width + 20) pick = "bottom";
      let left;
      let top;
      if (pick === "left") {
        left = Math.max(8, r.left - tr.width - 16);
        top = Math.max(8, r.top);
      } else {
        left = Math.max(8, r.left);
        top = Math.min(window.innerHeight - tr.height - 8, r.bottom + 12);
      }
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    });
    const nextBtn = el.querySelector("#cp-coach-next");
    const skipBtn = el.querySelector("#cp-coach-skip");
    nextBtn.addEventListener("click", ctx.next);
    skipBtn.addEventListener("click", ctx.skip);
  }

  // client/userscript/main.ts
  var LANDING_ORIGIN = "https://watch-party.pages.dev";
  function bootTopFrame() {
    let me = loadStoredName() ?? "";
    const initial = ensureRoom();
    const roomId = initial.roomId;
    let passphrase = initial.passphrase;
    const currentRoomUrl = () => roomLinkForCurrent(roomId, passphrase);
    let you = "";
    let adminId = "";
    let operators = [];
    let freeForAll = false;
    let ws = null;
    let rejected = false;
    let participants = [];
    let pendingUpdate = null;
    let panel = null;
    function canDrive() {
      return you === adminId || operators.includes(you);
    }
    const panelHooks = {
      onCopyLink: () => {
        const url = currentRoomUrl();
        navigator.clipboard.writeText(url).then(
          () => panel?.appendSystem("Room link copied."),
          () => panel?.appendSystem("Copy failed \u2014 link: " + url)
        );
      },
      onShareForNonInstallers: () => {
        const url = wrapperLinkFor(currentRoomUrl(), roomId, passphrase);
        navigator.clipboard.writeText(url).then(
          () => panel?.appendSystem("Onboarding link copied \u2014 friends without the extension will see install steps."),
          () => panel?.appendSystem("Copy failed \u2014 link: " + url)
        );
      },
      onToggleFFA: (next) => {
        freeForAll = next;
        send({ type: "ffa", freeForAll: next });
      },
      onSendChat: (text) => {
        const ts = Date.now();
        send({ type: "chat", from: you, name: me, text, ts });
        panel?.appendChat(you, me, text, ts);
      },
      onSubmitUsername: (name) => {
        me = name;
        localStorage.setItem("cp-name", name);
        connect();
      },
      onRename: (name) => {
        me = name;
        localStorage.setItem("cp-name", name);
        panel?.applyRename(you, name);
        send({ type: "rename", from: you, name });
      },
      onReact: (emoji) => {
        send({ type: "reaction", from: you, name: me, emoji, ts: Date.now() });
      },
      onTyping: () => {
        send({ type: "typing", from: you, name: me, ts: Date.now() });
      },
      onPromote: (target) => {
        if (you !== adminId) return;
        send({ type: "promote", target });
      },
      onDemote: (target) => {
        if (you !== adminId) return;
        send({ type: "demote", target });
      },
      onSetKey: (key) => {
        passphrase = key;
        writeRoomFragment(roomId, passphrase);
        panel?.appendSystem(
          key ? "\u{1F512} Room key set. Share the new link \u2014 friends will need to reconnect with it." : "\u{1F513} Room key cleared."
        );
        if (ws) try {
          ws.close();
        } catch {
        }
      },
      onReplayOnboarding: () => {
        resetOnboarded();
        launchOnboarding();
      }
    };
    function mountUI() {
      panel = mountPanel(panelHooks, me || void 0);
      if (you) {
        panel.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase });
      }
      if (pendingUpdate) panel.showUpdateBanner(pendingUpdate.tag, pendingUpdate.href);
    }
    mountUI();
    function launchOnboarding() {
      if (!panel) return;
      const a = panel.anchors;
      runCoachmark([
        { anchor: a.header, text: "Welcome to Watch-Party. Click the toolbar icon to turn it on for any tab \u2014 you're connected now.", placement: "left" },
        { anchor: a.copy, text: "Share this link with friends to watch together. The room ID lives in the URL after #.", placement: "left" },
        { anchor: a.nameForm, text: "Pick a display name to start chatting. You can change it later from the gear menu \u2014 old messages update too.", placement: "left" },
        { anchor: a.reactions, text: "Tap to send a floating reaction. Limited to one every 2 seconds.", placement: "left" },
        { anchor: a.layout, text: "Switch the chat between Overlay, Push (reflows the page), and Hidden.", placement: "bottom" },
        { anchor: a.settings, text: "Colors, text size, accessibility (colorblind / high contrast), and tour replay live in settings.", placement: "bottom" }
      ]);
    }
    let onboardingFired = false;
    function maybeOnboard() {
      if (onboardingFired) return;
      if (hasOnboarded()) return;
      onboardingFired = true;
      setTimeout(launchOnboarding, 600);
    }
    const video = makeTopFrameAdapter();
    const sync = createSyncClient({
      video,
      send: (m) => send(m),
      isAdmin: () => canDrive(),
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
        panel?.appendSystem("Disconnected. Reconnecting in 2s\u2026");
        setTimeout(connect, 2e3);
      });
    }
    if (me) connect();
    checkForUpdate().then((latest) => {
      if (latest && gt(latest, "0.6.0")) {
        pendingUpdate = { tag: latest, href: "https://github.com/AviouslyAvi/Watch-Party/releases/latest" };
        panel?.showUpdateBanner(latest, "https://github.com/AviouslyAvi/Watch-Party/releases/latest");
      }
    });
    function handle(msg) {
      switch (msg.type) {
        case "welcome":
          you = msg.you;
          adminId = msg.adminId;
          operators = msg.operators;
          freeForAll = msg.freeForAll;
          participants = msg.participants;
          panel?.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase });
          if (canDrive()) {
            sync.startHeartbeat();
            if (you === adminId) panel?.appendSystem("You are the admin. \u2B50 to grant playback to others, \u{1F451} stays with you.");
            else panel?.appendSystem("You're an operator \u2014 you can drive playback.");
          }
          if (msg.lastState) sync.applyRemote(msg.lastState);
          maybeOnboard();
          return;
        case "participants":
          adminId = msg.adminId;
          operators = msg.operators;
          participants = msg.participants;
          panel?.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase });
          if (canDrive()) sync.startHeartbeat();
          return;
        case "rename":
          panel?.applyRename(msg.from, msg.name);
          if (msg.from !== you) panel?.appendSystem(`${msg.name} renamed.`);
          return;
        case "ffa":
          freeForAll = msg.freeForAll;
          panel?.appendSystem(`Free-for-all: ${freeForAll ? "ON" : "OFF"}`);
          return;
        case "pathDiff":
          panel?.appendSystem(`\u26A0\uFE0F Different content. You: ${msg.yourPath} / Them: ${msg.theirPath}`);
          return;
        case "rejected":
          rejected = true;
          if (ws) try {
            ws.close();
          } catch {
          }
          panel?.appendSystem(
            msg.reason === "passphrase" ? "\u274C Wrong room key. Get the full share link from whoever set up the room." : "\u274C Connection rejected."
          );
          return;
        case "revert":
          sync.revert(msg.at, msg.paused);
          panel?.appendSystem("Only the admin or operators can control playback.");
          return;
        case "chat":
          if (msg.from !== you) panel?.appendChat(msg.from, msg.name, msg.text, msg.ts);
          return;
        case "reaction":
          panel?.showReaction(msg.from, msg.from === you ? "you" : msg.name, msg.emoji);
          return;
        case "typing":
          if (msg.from !== you) panel?.showTyping(msg.from, msg.name);
          return;
        case "play":
        case "pause":
        case "seek":
        case "state":
          sync.applyRemote(msg);
          return;
      }
    }
    return {
      teardownUI() {
        panel?.destroy();
        panel = null;
      },
      remountUI() {
        if (!panel) mountUI();
      },
      shutdown() {
        rejected = true;
        panel?.destroy();
        panel = null;
        if (ws) try {
          ws.close();
        } catch {
        }
        ws = null;
      }
    };
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
  var UPDATE_CACHE_KEY = "cp-update-check-v2";
  async function checkForUpdate() {
    try {
      const cached = localStorage.getItem(UPDATE_CACHE_KEY);
      if (cached) {
        const { tag: tag2, ts } = JSON.parse(cached);
        if (Date.now() - ts < 6 * 60 * 60 * 1e3) return tag2;
      }
      const res = await fetch("https://api.github.com/repos/AviouslyAvi/Watch-Party/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return null;
      const json = await res.json();
      const tag = json.tag_name ?? null;
      if (tag) localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ tag, ts: Date.now() }));
      return tag;
    } catch {
      return null;
    }
  }
  function gt(a, b) {
    const parse = (s) => s.replace(/^v/, "").split(".").map((n) => {
      const num = parseInt(n, 10);
      return Number.isFinite(num) ? num : 0;
    });
    const pa = parse(a);
    const pb = parse(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const ai = pa[i] ?? 0;
      const bi = pb[i] ?? 0;
      if (ai !== bi) return ai > bi;
    }
    return false;
  }

  // client/extension/content.ts
  if (window !== window.top) {
    runIframeBridge();
  } else {
    const w = window;
    if (w.__WATCH_PARTY__) {
      w.__WATCH_PARTY__.remount();
    } else {
      const handle = bootTopFrame();
      w.__WATCH_PARTY__ = {
        handle,
        teardown: () => handle.teardownUI(),
        remount: () => handle.remountUI(),
        shutdown: () => handle.shutdown()
      };
      chrome.runtime.onMessage.addListener((msg) => {
        const m = msg;
        if (!m || typeof m.type !== "string") return;
        const wp = window.__WATCH_PARTY__;
        if (!wp) return;
        if (m.type === "wp-deactivate") wp.teardown();
        else if (m.type === "wp-hard-disconnect") wp.shutdown();
        else if (m.type === "wp-remount") wp.remount();
      });
    }
  }
})();
