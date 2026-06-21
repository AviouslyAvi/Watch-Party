import type { ClientId, Participant, ReactionEmoji } from "../../../shared/protocol";
import { REACTION_EMOJIS } from "../../../shared/protocol";
import { colorFor, type ColorblindMode } from "./peer-color";

export interface PanelState {
  you: string;
  adminId: string;
  freeForAll: boolean;
  participants: Participant[];
  roomUrl: string;
  passphrase?: string | null;
}

export interface PanelHooks {
  onToggleFFA: (next: boolean) => void;
  onSendChat: (text: string) => void;
  onCopyLink: () => void;
  onShareForNonInstallers: () => void;
  onSubmitUsername: (name: string) => void;
  onRename: (name: string) => void;
  onSetKey: (key: string | null) => void;
  onReact: (emoji: ReactionEmoji) => void;
  onTyping: () => void;
  onPromote: (target: ClientId) => void;
  onDemote: (target: ClientId) => void;
  onReplayOnboarding: () => void;
  onDeactivate: () => void;
}

const REACTION_FLOAT_MAX = 5;
const REACTION_FLOAT_MS = 2000;
const REACTION_SEND_THROTTLE_MS = 2000;
const TYPING_DECAY_MS = 3000;
const TYPING_SEND_THROTTLE_MS = 1500;

const SIDEBAR_WIDTH = 320;

export type LayoutMode = "overlay" | "push" | "hidden";

export interface Settings {
  layoutMode: LayoutMode;
  bgColor: string;
  textColor: string;
  accent: string;
  accentText: string;
  opacity: number;
  fontSize: number;
  colorblind: ColorblindMode;
  highContrast: boolean;
  showTimestamps: boolean;
}

// Preset color themes. Each sets the three theme-defining tokens — surface
// (bgColor), foreground (textColor), and accent — that drive every CSS var the
// panel reads. accentText is the readable on-accent color (buttons sit on the
// accent fill); precomputed per preset so we don't luminance-check on every
// paint. Manual picker edits fall back to accentTextFor(). All five are dark
// surfaces; a light theme would need the hardcoded internal grays audited too.
export interface ThemePreset {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  accent: string;
  accentText: string;
}

export const THEMES: ThemePreset[] = [
  { id: "midnight", name: "Midnight", bgColor: "#141416", textColor: "#eeeeee", accent: "#f97316", accentText: "#1a1206" },
  { id: "cinema", name: "Cinema", bgColor: "#0d0b0c", textColor: "#f3e7d6", accent: "#e11d48", accentText: "#ffffff" },
  { id: "synthwave", name: "Synthwave", bgColor: "#1a1030", textColor: "#f0e6ff", accent: "#ec4899", accentText: "#ffffff" },
  { id: "forest", name: "Forest", bgColor: "#0f1f17", textColor: "#e2efe8", accent: "#34d399", accentText: "#04241a" },
  { id: "ocean", name: "Ocean", bgColor: "#0b1f2e", textColor: "#e0f2fe", accent: "#38bdf8", accentText: "#04293b" },
];

// Pick black-ish or white text for legibility on an arbitrary accent fill.
// Used when the user nudges the accent picker off a preset value.
function accentTextFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff,
    g = (n >> 8) & 0xff,
    b = n & 0xff;
  // Rec. 601 luma; threshold tuned so mid saturated hues read correctly.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#1a1206" : "#ffffff";
}

const DEFAULTS: Settings = {
  layoutMode: "overlay",
  bgColor: "#141416",
  textColor: "#eeeeee",
  accent: "#f97316",
  accentText: "#1a1206",
  opacity: 0.88,
  fontSize: 13,
  colorblind: "none",
  highContrast: false,
  showTimestamps: false,
};

const SETTINGS_KEY = "cp-settings-v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

interface ChatRecord {
  el: HTMLDivElement;
  from: ClientId;
  text: string;
  ts: number;
}

export function mountPanel(hooks: PanelHooks, initialUsername?: string) {
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
  // Always-visible toggle tab. Lives outside the panel host so that hiding the
  // panel (transform: translateX(320px)) doesn't drag the tab off-screen — the
  // userscript path has no toolbar icon to fall back on, so this is the sole
  // escape hatch when layout is "hidden". Position is set by applyLayout().
  const tab = document.createElement("button");
  tab.id = "cp-tab";
  tab.title = "Toggle Watch-Party chat (Alt+Shift+W)";
  tab.textContent = "›";
  tab.style.cssText = `
    position: fixed; top: 50%; right: ${SIDEBAR_WIDTH}px;
    transform: translateY(-50%);
    width: 28px; height: 56px;
    background: var(--cp-bg, #141416); color: var(--cp-text, #eee);
    border: 1px solid #333; border-right: none;
    border-radius: 8px 0 0 8px;
    cursor: pointer; font-size: 14px; padding: 0;
    z-index: 2147483647;
    transition: right 200ms ease;
  `;

  host.innerHTML = `
    <div id="cp-header" style="padding:10px 12px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="font-weight:600;color:var(--cp-accent,#f97316);">🎬 Watch-Party</span>
      <div style="display:flex;gap:4px;align-items:center;">
        <div id="cp-layout-modes" style="display:flex;gap:2px;border:1px solid #2a2a2a;border-radius:6px;overflow:hidden;">
          <button type="button" data-mode="overlay" class="cp-mode-btn" title="Overlay the chat on top of the page" style="background:transparent;color:#bbb;border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">⧉</button>
          <button type="button" data-mode="push" class="cp-mode-btn" title="Push the page over to make room" style="background:transparent;color:#bbb;border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">⇤</button>
          <button type="button" data-mode="hidden" class="cp-mode-btn" title="Hide the chat (tab stays visible)" style="background:transparent;color:#bbb;border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">⌄</button>
        </div>
        <button id="cp-settings-btn" title="Settings" style="background:transparent;color:#bbb;border:1px solid #2a2a2a;border-radius:6px;padding:3px 6px;cursor:pointer;font:inherit;font-size:13px;line-height:1;">⚙</button>
      </div>
    </div>
    <a id="cp-update-banner" href="#" target="_blank" rel="noopener" style="display:none;padding:8px 12px;background:#1e3a8a;color:#dbeafe;font-size:12px;text-decoration:none;border-bottom:1px solid #1d4ed8;">
      <span id="cp-update-text"></span>
    </a>
    <div id="cp-settings-drawer" style="display:none;padding:10px 12px;border-bottom:1px solid #333;background:rgba(0,0,0,0.2);max-height:50vh;overflow-y:auto;font-size:12px;"></div>
    <form id="cp-name-form" style="padding:12px;display:none;flex-direction:column;gap:8px;">
      <label style="font-size:12px;color:#bbb;">Pick a display name to join chat</label>
      <input id="cp-name-input" maxlength="32" placeholder="e.g. avi" autocomplete="off" style="padding:8px;background:#111;border:1px solid #333;border-radius:6px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
      <button id="cp-name-submit" type="submit" disabled style="padding:8px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:6px;cursor:pointer;opacity:0.5;">Join chat</button>
    </form>
    <div id="cp-main" style="display:flex;flex-direction:column;flex:1;min-height:0;">
      <div style="padding:8px 12px;border-bottom:1px solid #2a2a2a;display:flex;flex-direction:column;gap:6px;">
        <button id="cp-copy" style="width:100%;padding:7px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:6px;cursor:pointer;font:inherit;">Copy room link</button>
        <button id="cp-share-onboard" title="Sends friends through install steps first" style="width:100%;padding:6px;background:transparent;color:#bbb;border:1px solid #333;border-radius:6px;cursor:pointer;font:inherit;font-size:12px;">Copy onboarding link</button>
      </div>
      <div id="cp-key-wrap" style="padding:8px 12px;border-bottom:1px solid #2a2a2a;display:none;font-size:12px;color:#bbb;">
        <button id="cp-key-toggle" type="button" style="background:none;border:none;color:#bbb;cursor:pointer;padding:0;font:inherit;text-decoration:underline;">🔒 Add room key</button>
        <form id="cp-key-form" style="display:none;flex-direction:column;gap:6px;margin-top:6px;">
          <input id="cp-key-input" maxlength="64" placeholder="Out-of-band secret" autocomplete="off" style="padding:6px;background:#111;border:1px solid #333;border-radius:4px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
          <div style="display:flex;gap:6px;">
            <button id="cp-key-save" type="submit" style="flex:1;padding:5px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
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
          (e) => `<button type="button" data-emoji="${e}" class="cp-react-btn" style="flex:1;padding:4px 0;background:transparent;border:1px solid #2a2a2a;border-radius:6px;cursor:pointer;font-size:16px;line-height:1;">${e}</button>`,
        ).join("")}
      </div>
      <div id="cp-typing" style="height:16px;padding:0 12px;font-size:11px;color:#888;opacity:0;transition:opacity 200ms;line-height:16px;"></div>
      <form id="cp-form" style="display:flex;border-top:1px solid #2a2a2a;">
        <input id="cp-input" placeholder="Type a message…" style="flex:1;padding:10px;background:transparent;border:none;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
        <button style="background:none;border:none;color:var(--cp-accent,#2563eb);padding:0 12px;cursor:pointer;font:inherit;">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(host);
  document.body.appendChild(tab);

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
      .cp-mode-btn[data-active="1"] { background:#2a2a2a !important; color:var(--cp-accent,#f97316) !important; }
      #avious-party-panel.cp-high-contrast { --cp-bg: #000 !important; --cp-text: #fff !important; --cp-bg-opacity: 1 !important; }
      .cp-people-row { display:flex; align-items:center; gap:6px; padding:2px 0; }
      .cp-people-row button.cp-op-btn { background:transparent;border:1px solid #333;border-radius:4px;color:#bbb;padding:1px 6px;cursor:pointer;font-size:10px; }
      .cp-people-row button.cp-op-btn:hover { background:#222;border-color:#444; }
    `;
    document.head.appendChild(styleEl);
  }

  const $ = <T extends HTMLElement>(id: string) => host.querySelector(id) as T;

  // ─────────────────────────── Layout mode ───────────────────────────────────
  const ORIGINAL_MARGIN_RIGHT_KEY = "__cp_orig_margin_right";
  function applyLayout(mode: LayoutMode) {
    const docEl = document.documentElement;
    type DocWithCache = HTMLElement & { [ORIGINAL_MARGIN_RIGHT_KEY]?: string };
    const cached = (docEl as DocWithCache);
    if (cached[ORIGINAL_MARGIN_RIGHT_KEY] === undefined) {
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
    Array.from(host.querySelectorAll<HTMLButtonElement>(".cp-mode-btn")).forEach((btn) => {
      btn.dataset.active = btn.dataset.mode === mode ? "1" : "0";
    });
    tab.textContent = mode === "hidden" ? "‹" : "›";
    // Pin tab to the right edge of the viewport when hidden so it's always
    // reachable; otherwise sit it against the panel's left edge.
    tab.style.right = mode === "hidden" ? "0px" : `${SIDEBAR_WIDTH}px`;
  }

  function setLayoutMode(mode: LayoutMode, persist = true) {
    settings.layoutMode = mode;
    if (persist) saveSettings(settings);
    applyLayout(mode);
  }

  Array.from(host.querySelectorAll<HTMLButtonElement>(".cp-mode-btn")).forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode as LayoutMode | undefined;
      if (m) setLayoutMode(m);
    });
  });
  tab.addEventListener("click", () => {
    setLayoutMode(settings.layoutMode === "hidden" ? "overlay" : "hidden");
  });

  // Keyboard escape hatch — Alt+Shift+W toggles the panel. Critical for the
  // userscript path, since there's no toolbar icon if the tab somehow gets
  // covered by a site's own UI.
  const layoutKeyHandler = (e: KeyboardEvent) => {
    if (e.altKey && e.shiftKey && (e.key === "W" || e.key === "w")) {
      e.preventDefault();
      setLayoutMode(settings.layoutMode === "hidden" ? "overlay" : "hidden");
    }
  };
  document.addEventListener("keydown", layoutKeyHandler);

  // Fullscreen guard — force hidden while in fullscreen, restore on exit.
  let preFullscreenMode: LayoutMode | null = null;
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

  // Participant + chat state — declared early so applyTheme()'s
  // rerenderPeopleList()/rerenderChatColors() calls don't hit a TDZ during the
  // initial-theme pass at boot. applyTheme() runs while the settings drawer is
  // built (well before the "Chat" section below), so anything it touches must
  // already be initialized here. (Real bug — TDZ on currentYou surfaced on
  // cineby.sc invite-hash auto-activation in v0.8.1; the same trap on chatLog
  // silently killed every panel button on boot until v0.8.4.)
  let currentParticipants: Participant[] = [];
  let currentYou = "";
  let currentAdminId = "";
  const nameMap = new Map<ClientId, string>();
  const chatLog: ChatRecord[] = [];

  // ─────────────────────────── Settings drawer ───────────────────────────────
  function applyTheme() {
    host.style.setProperty("--cp-bg", settings.bgColor);
    host.style.setProperty("--cp-text", settings.textColor);
    host.style.setProperty("--cp-accent", settings.accent);
    host.style.setProperty("--cp-accent-text", settings.accentText);
    host.style.setProperty("--cp-bg-opacity", String(settings.opacity));
    host.style.setProperty("--cp-font-size", `${settings.fontSize}px`);
    // The pinned toggle tab lives outside the host, so set the vars on it too.
    tab.style.setProperty("--cp-bg", settings.bgColor);
    tab.style.setProperty("--cp-text", settings.textColor);
    host.classList.toggle("cp-high-contrast", settings.highContrast);
    // Re-color participant list & chat to pick up colorblind palette change.
    rerenderPeopleList();
    rerenderChatColors();
  }

  // Update the active-ring on each preset swatch to match current settings.
  // A swatch is "active" only when bg + text + accent all match the preset, so
  // manual picker tweaks correctly clear the highlight (theme becomes custom).
  function refreshThemeSwatches() {
    Array.from(host.querySelectorAll<HTMLButtonElement>(".cp-theme-swatch")).forEach((btn) => {
      const preset = THEMES.find((t) => t.id === btn.dataset.theme);
      if (!preset) return;
      const active =
        preset.bgColor === settings.bgColor &&
        preset.textColor === settings.textColor &&
        preset.accent === settings.accent;
      btn.style.borderColor = active ? preset.accent : "transparent";
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderSettingsDrawer() {
    const drawer = $("#cp-settings-drawer") as HTMLDivElement;
    drawer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:#bbb;">Display name</div>
          <form id="cp-rename-form" style="display:flex;gap:6px;">
            <input id="cp-rename-input" maxlength="32" value="${escapeAttr(currentName)}" style="flex:1;padding:5px;background:#111;border:1px solid #333;border-radius:4px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
            <button type="submit" style="padding:5px 8px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
          </form>
        </section>
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:#bbb;">Theme</div>
          <div id="cp-theme-presets" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:6px;">
            ${THEMES.map((t) => {
              const active = t.bgColor === settings.bgColor && t.textColor === settings.textColor && t.accent === settings.accent;
              return `<button type="button" class="cp-theme-swatch" data-theme="${t.id}" title="${escapeAttr(t.name)}" aria-pressed="${active ? "true" : "false"}" style="border:2px solid ${active ? t.accent : "transparent"};border-radius:6px;background:${t.bgColor};padding:6px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;">
                <span style="width:20px;height:20px;border-radius:50%;background:${t.accent};"></span>
                <span style="font-size:10px;color:${t.textColor};line-height:1;">${escapeHtml(t.name)}</span>
              </button>`;
            }).join("")}
          </div>
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
          <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span>Accent</span>
            <input type="color" id="cp-set-accent" value="${settings.accent}"/>
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
          <button id="cp-replay-tour" style="width:100%;padding:5px;background:#333;color:var(--cp-text,#eee);border:none;border-radius:4px;cursor:pointer;font:inherit;margin-bottom:6px;">Replay onboarding tour</button>
          <button id="cp-deactivate" title="Closes the socket, tears down the chat, and remembers this site as off. Click the 🎬 button in the corner to turn it back on." style="width:100%;padding:5px;background:#3a1414;color:#fca5a5;border:1px solid #5c1f1f;border-radius:4px;cursor:pointer;font:inherit;">Turn off Watch-Party here</button>
          <div style="font-size:11px;color:#777;margin-top:4px;line-height:1.4;">Dismisses the chat for this site. The 🎬 button in the corner reactivates. Invite links auto-reactivate.</div>
        </section>
        <section style="font-size:11px;color:#777;border-top:1px solid #2a2a2a;padding-top:8px;">
          Watch-Party. Room data lives in memory only — close the tab to leave.
        </section>
      </div>
    `;
    ($("#cp-set-bg") as HTMLInputElement).addEventListener("input", (e) => {
      settings.bgColor = (e.target as HTMLInputElement).value;
      saveSettings(settings);
      applyTheme();
      refreshThemeSwatches();
    });
    ($("#cp-set-text") as HTMLInputElement).addEventListener("input", (e) => {
      settings.textColor = (e.target as HTMLInputElement).value;
      saveSettings(settings);
      applyTheme();
      refreshThemeSwatches();
    });
    ($("#cp-set-accent") as HTMLInputElement).addEventListener("input", (e) => {
      settings.accent = (e.target as HTMLInputElement).value;
      settings.accentText = accentTextFor(settings.accent);
      saveSettings(settings);
      applyTheme();
      refreshThemeSwatches();
    });
    Array.from(host.querySelectorAll<HTMLButtonElement>(".cp-theme-swatch")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = THEMES.find((t) => t.id === btn.dataset.theme);
        if (!preset) return;
        settings.bgColor = preset.bgColor;
        settings.textColor = preset.textColor;
        settings.accent = preset.accent;
        settings.accentText = preset.accentText;
        saveSettings(settings);
        applyTheme();
        // Sync the color pickers + active ring to the chosen preset.
        ($("#cp-set-bg") as HTMLInputElement).value = preset.bgColor;
        ($("#cp-set-text") as HTMLInputElement).value = preset.textColor;
        ($("#cp-set-accent") as HTMLInputElement).value = preset.accent;
        refreshThemeSwatches();
      });
    });
    const opacityInput = $("#cp-set-opacity") as HTMLInputElement;
    opacityInput.addEventListener("input", () => {
      settings.opacity = parseFloat(opacityInput.value);
      ($("#cp-opacity-val") as HTMLSpanElement).textContent = settings.opacity.toFixed(2);
      saveSettings(settings);
      applyTheme();
    });
    const fsInput = $("#cp-set-fs") as HTMLInputElement;
    fsInput.addEventListener("input", () => {
      settings.fontSize = parseInt(fsInput.value, 10);
      ($("#cp-fs-val") as HTMLSpanElement).textContent = String(settings.fontSize);
      saveSettings(settings);
      applyTheme();
    });
    const cbSelect = $("#cp-set-cb") as unknown as HTMLSelectElement;
    cbSelect.value = settings.colorblind;
    cbSelect.addEventListener("change", () => {
      settings.colorblind = cbSelect.value as ColorblindMode;
      saveSettings(settings);
      applyTheme();
    });
    ($("#cp-set-hc") as HTMLInputElement).addEventListener("change", (e) => {
      settings.highContrast = (e.target as HTMLInputElement).checked;
      saveSettings(settings);
      applyTheme();
    });
    ($("#cp-set-ts") as HTMLInputElement).addEventListener("change", (e) => {
      settings.showTimestamps = (e.target as HTMLInputElement).checked;
      saveSettings(settings);
      rerenderTimestamps();
    });
    ($("#cp-replay-tour") as HTMLButtonElement).addEventListener("click", () => {
      hooks.onReplayOnboarding();
    });
    ($("#cp-deactivate") as HTMLButtonElement).addEventListener("click", () => {
      hooks.onDeactivate();
    });
    const renameForm = $("#cp-rename-form") as HTMLFormElement;
    const renameInput = $("#cp-rename-input") as HTMLInputElement;
    for (const ev of ["keydown", "keyup", "keypress"]) renameInput.addEventListener(ev, stop);
    renameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = renameInput.value.trim().slice(0, 32);
      if (!v || v === currentName) return;
      hooks.onRename(v);
    });
  }

  ($("#cp-settings-btn") as HTMLButtonElement).addEventListener("click", () => {
    const drawer = $("#cp-settings-drawer") as HTMLDivElement;
    const open = drawer.style.display !== "none";
    if (open) {
      drawer.style.display = "none";
    } else {
      renderSettingsDrawer();
      drawer.style.display = "block";
    }
  });

  // Apply initial layout + theme.
  setLayoutMode(settings.layoutMode, false);
  applyTheme();

  // ─────────────────────────── Reactions ─────────────────────────────────────
  const reactionsBar = $("#cp-reactions") as HTMLDivElement;
  let lastReactionSent = 0;
  let reactionThrottleTimer: number | null = null;
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
    const t = e.target as HTMLElement;
    const btn = t.closest(".cp-react-btn") as HTMLElement | null;
    if (!btn) return;
    const emoji = btn.dataset.emoji as ReactionEmoji | undefined;
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

  const floatLayer = $("#cp-reactions-float") as HTMLDivElement;
  function showReaction(id: ClientId, name: string, emoji: string) {
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

  // ─────────────────────────── Chat input ────────────────────────────────────
  let collapsed = settings.layoutMode === "hidden";
  void collapsed; // tracked by setLayoutMode

  ($("#cp-copy") as HTMLButtonElement).addEventListener("click", () => hooks.onCopyLink());
  ($("#cp-share-onboard") as HTMLButtonElement).addEventListener("click", () => hooks.onShareForNonInstallers());
  const ffa = $("#cp-ffa") as HTMLInputElement;
  ffa.addEventListener("change", () => hooks.onToggleFFA(ffa.checked));
  const form = $("#cp-form") as HTMLFormElement;
  const input = $("#cp-input") as HTMLInputElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    hooks.onSendChat(t);
    input.value = "";
  });
  const stop = (e: Event) => e.stopPropagation();
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

  // ─────────────────────────── Typing indicator ──────────────────────────────
  const typingEl = $("#cp-typing") as HTMLDivElement;
  const typers = new Map<ClientId, { name: string; timeoutId: number }>();
  function renderTyping() {
    const entries = [...typers.entries()];
    typingEl.innerHTML = "";
    if (entries.length >= 3) {
      typingEl.textContent = "Several people are typing…";
    } else if (entries.length > 0) {
      const nameSpan = (id: ClientId, name: string) =>
        `<span style="color:${colorFor(id, settings.colorblind)};">${escapeHtml(name)}</span>`;
      if (entries.length === 1) {
        const e0 = entries[0];
        if (e0) typingEl.innerHTML = `${nameSpan(e0[0], e0[1].name)} is typing…`;
      } else {
        const e0 = entries[0];
        const e1 = entries[1];
        if (e0 && e1) typingEl.innerHTML = `${nameSpan(e0[0], e0[1].name)} and ${nameSpan(e1[0], e1[1].name)} are typing…`;
      }
    }
    typingEl.style.opacity = entries.length > 0 ? "1" : "0";
  }
  function showTyping(from: ClientId, name: string) {
    const existing = typers.get(from);
    if (existing) clearTimeout(existing.timeoutId);
    const timeoutId = window.setTimeout(() => {
      typers.delete(from);
      renderTyping();
    }, TYPING_DECAY_MS);
    typers.set(from, { name, timeoutId });
    renderTyping();
  }

  // ─────────────────────────── Name gate ─────────────────────────────────────
  let currentName = initialUsername ?? "";

  const nameForm = $("#cp-name-form") as HTMLFormElement;
  const nameInput = $("#cp-name-input") as HTMLInputElement;
  const nameSubmit = $("#cp-name-submit") as HTMLButtonElement;
  const mainWrap = $("#cp-main") as HTMLDivElement;
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

  // ─────────────────────────── Room key ──────────────────────────────────────
  const keyWrap = $("#cp-key-wrap") as HTMLDivElement;
  const keyToggle = $("#cp-key-toggle") as HTMLButtonElement;
  const keyForm = $("#cp-key-form") as HTMLFormElement;
  const keyInput = $("#cp-key-input") as HTMLInputElement;
  const keyClear = $("#cp-key-clear") as HTMLButtonElement;
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

  // ─────────────────────────── Participants ──────────────────────────────────
  // (let currentParticipants/currentYou/currentAdminId + nameMap declared
  //  earlier — see comment by the Settings drawer block. Don't redeclare.)

  function rerenderPeopleList() {
    const peopleEl = $("#cp-people") as HTMLDivElement;
    const youIsAdmin = currentYou === currentAdminId;
    peopleEl.innerHTML = currentParticipants
      .map((p) => {
        const isYou = p.id === currentYou;
        const adminBadge = p.isAdmin ? "👑 " : "";
        const opBadge = !p.isAdmin && p.isOperator ? "⭐ " : "";
        const youTag = isYou ? " (you)" : "";
        const action =
          youIsAdmin && !isYou && !p.isAdmin
            ? p.isOperator
              ? `<button class="cp-op-btn" data-action="demote" data-target="${p.id}">remove ⭐</button>`
              : `<button class="cp-op-btn" data-action="promote" data-target="${p.id}">give ⭐</button>`
            : "";
        return `<div class="cp-people-row">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${adminBadge}${opBadge}<span style="color:${colorFor(p.id, settings.colorblind)};">${escapeHtml(p.name)}</span>${youTag}
          </span>
          ${action}
        </div>`;
      })
      .join("");
    Array.from(peopleEl.querySelectorAll<HTMLButtonElement>(".cp-op-btn")).forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (!target) return;
        if (btn.dataset.action === "promote") hooks.onPromote(target);
        else hooks.onDemote(target);
      });
    });
  }

  function setState(s: PanelState) {
    currentYou = s.you;
    currentAdminId = s.adminId;
    currentParticipants = s.participants;
    for (const p of s.participants) nameMap.set(p.id, p.name);
    // If our own name from the server differs from local cache, sync.
    const youParticipant = s.participants.find((p) => p.id === s.you);
    if (youParticipant && youParticipant.name !== currentName) {
      currentName = youParticipant.name;
    }
    const isAdmin = s.you === s.adminId;
    ($("#cp-ffa-wrap") as HTMLDivElement).style.display = isAdmin ? "block" : "none";
    keyWrap.style.display = isAdmin ? "block" : "none";
    keyToggle.textContent = s.passphrase ? "🔓 Key set — change or clear" : "🔒 Add room key";
    keyInput.value = s.passphrase ?? "";
    ffa.checked = s.freeForAll;
    rerenderPeopleList();
    rerenderChatColors();
  }

  // ─────────────────────────── Chat ──────────────────────────────────────────
  // chatLog is declared with the participant state above (TDZ-safe for applyTheme).
  function fmtTs(ts: number): string {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  function renderChatLine(rec: ChatRecord) {
    const liveName = nameMap.get(rec.from) ?? "…";
    const tsPart = settings.showTimestamps
      ? `<span class="cp-ts" style="color:#666;font-size:10px;margin-right:6px;">${fmtTs(rec.ts)}</span>`
      : "";
    rec.el.innerHTML = `${tsPart}<b data-cp-from="${rec.from}" style="color:${colorFor(rec.from, settings.colorblind)};">${escapeHtml(liveName)}</b>: ${escapeHtml(rec.text)}`;
  }
  function appendChat(id: ClientId, name: string, text: string, ts: number = Date.now()) {
    nameMap.set(id, name);
    const div = document.createElement("div");
    div.style.marginBottom = "6px";
    div.dataset.cpRecord = "1";
    const rec: ChatRecord = { el: div, from: id, text, ts };
    chatLog.push(rec);
    renderChatLine(rec);
    const chat = $("#cp-chat") as HTMLDivElement;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function applyRename(id: ClientId, name: string) {
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

  function appendSystem(text: string) {
    const div = document.createElement("div");
    div.style.cssText = "color:#888;font-style:italic;margin-bottom:6px;";
    div.textContent = text;
    const chat = $("#cp-chat") as HTMLDivElement;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function showUpdateBanner(latestTag: string, href: string) {
    const banner = $("#cp-update-banner") as HTMLAnchorElement;
    const text = $("#cp-update-text") as HTMLSpanElement;
    text.textContent = `Update available: ${latestTag} — click to download`;
    banner.href = href;
    banner.style.display = "block";
  }

  function destroy() {
    for (const t of typers.values()) clearTimeout(t.timeoutId);
    typers.clear();
    if (reactionThrottleTimer !== null) clearTimeout(reactionThrottleTimer);
    document.removeEventListener("keydown", layoutKeyHandler);
    // Restore the original margin-right we cached.
    const docEl = document.documentElement;
    type DocWithCache = HTMLElement & { [ORIGINAL_MARGIN_RIGHT_KEY]?: string };
    const cached = (docEl as DocWithCache)[ORIGINAL_MARGIN_RIGHT_KEY];
    if (cached !== undefined) docEl.style.marginRight = cached;
    host.remove();
    tab.remove();
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
      header: () => $("#cp-header") as HTMLElement,
      copy: () => $("#cp-copy") as HTMLElement,
      nameForm: () => $("#cp-name-form") as HTMLElement,
      reactions: () => $("#cp-reactions") as HTMLElement,
      layout: () => $("#cp-layout-modes") as HTMLElement,
      settings: () => $("#cp-settings-btn") as HTMLElement,
    },
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escapeAttr(s: string) {
  return escapeHtml(s);
}
