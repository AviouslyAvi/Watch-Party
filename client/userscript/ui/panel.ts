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
  /** True when this client may drive (admin or operator) — gates the "Bring everyone here" button. */
  canDrive?: boolean;
}

export interface PanelHooks {
  onToggleFFA: (next: boolean) => void;
  onSendChat: (text: string) => void;
  onCopyLink: () => void;
  onShareForNonInstallers: () => void;
  onBringEveryone: () => void;
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
  blur: number;
  fontSize: number;
  colorblind: ColorblindMode;
  highContrast: boolean;
  showTimestamps: boolean;
}

// Preset color themes. Each sets the three theme-defining tokens — surface
// (bgColor), foreground (textColor), and accent — that drive every CSS var the
// panel reads. accentText is the readable on-accent color (buttons sit on the
// accent fill); precomputed per preset so we don't luminance-check on every
// paint. Manual picker edits fall back to accentTextFor(). Internal grays
// (borders, muted text, input fills, hovers) derive from bg/text via color-mix
// in applyTheme(), so a light surface stays legible without per-preset gray
// fields — see the --cp-border/--cp-muted/--cp-input-bg/--cp-hover tokens.
export interface ThemePreset {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  accent: string;
  accentText: string;
  /** Default panel opacity when selected (0–1). Falls back to current setting if unset. */
  opacity?: number;
  /** Backdrop-filter blur in px. Default: 6. */
  blur?: number;
}

export const THEMES: ThemePreset[] = [
  { id: "clarity",  name: "Clarity",  bgColor: "#ffffff",  textColor: "#1d1d1f", accent: "#0071e3", accentText: "#ffffff" },
  { id: "vibrancy", name: "Vibrancy", bgColor: "#1c1c1e",  textColor: "#f5f5f7", accent: "#0a84ff", accentText: "#ffffff", opacity: 0.55, blur: 32 },
  { id: "bubbles",  name: "Bubbles",  bgColor: "#f2f2f7",  textColor: "#1c1c1e", accent: "#007aff", accentText: "#ffffff" },
  { id: "cinema",   name: "Cinema",   bgColor: "#201a12",  textColor: "#f3e7d6", accent: "#ff6a3d", accentText: "#ffffff" },
  { id: "graphite", name: "Graphite", bgColor: "#1c1c1e",  textColor: "#f5f5f7", accent: "#8e8e93", accentText: "#ffffff" },
  { id: "midnight", name: "Midnight", bgColor: "#000000",  textColor: "#f5f5f7", accent: "#6e6aff", accentText: "#ffffff" },
  { id: "sorbet",   name: "Sorbet",   bgColor: "#fceef4",  textColor: "#4a2f3c", accent: "#ff5e8a", accentText: "#ffffff" },
  { id: "compact",  name: "Compact",  bgColor: "#fbfbfd",  textColor: "#1d1d1f", accent: "#007aff", accentText: "#ffffff" },
  { id: "aurora",   name: "Aurora",   bgColor: "#12121a",  textColor: "#f5f5f7", accent: "#4f8cff", accentText: "#ffffff", opacity: 0.45, blur: 48 },
  { id: "reader",   name: "Reader",   bgColor: "#f7f3ec",  textColor: "#2b2620", accent: "#b85c38", accentText: "#ffffff" },
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
  blur: 6,
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
    border-left: 1px solid var(--cp-border, #333); z-index: 2147483647;
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
    border: 1px solid var(--cp-border, #333); border-right: none;
    border-radius: 8px 0 0 8px;
    cursor: pointer; font-size: 14px; padding: 0;
    z-index: 2147483647;
    transition: right 200ms ease;
  `;

  host.innerHTML = `
    <div id="cp-header" style="padding:10px 12px;border-bottom:1px solid var(--cp-border,#333);display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div style="display:flex;align-items:center;gap:9px;min-width:0;">
        <span style="width:24px;height:24px;flex:none;border-radius:7px;background:linear-gradient(180deg,color-mix(in srgb,var(--cp-accent,#f97316) 68%,#fff),var(--cp-accent,#f97316));display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px color-mix(in srgb,var(--cp-accent,#f97316) 45%,transparent);"><span style="width:0;height:0;border-style:solid;border-width:4px 0 4px 7px;border-color:transparent transparent transparent var(--cp-accent-text,#fff);margin-left:1px;"></span></span>
        <span style="font-weight:600;letter-spacing:-0.01em;color:var(--cp-text,#eee);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Watch Party</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <div id="cp-layout-modes" style="display:flex;gap:2px;border:1px solid var(--cp-border,#2a2a2a);border-radius:6px;overflow:hidden;">
          <button type="button" data-mode="overlay" class="cp-mode-btn" title="Overlay the chat on top of the page" style="background:transparent;color:var(--cp-muted,#bbb);border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">⧉</button>
          <button type="button" data-mode="push" class="cp-mode-btn" title="Push the page over to make room" style="background:transparent;color:var(--cp-muted,#bbb);border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">⇤</button>
          <button type="button" data-mode="hidden" class="cp-mode-btn" title="Hide the chat (tab stays visible)" style="background:transparent;color:var(--cp-muted,#bbb);border:none;padding:4px 6px;cursor:pointer;font:inherit;font-size:11px;">⌄</button>
        </div>
        <button id="cp-settings-btn" title="Settings" style="background:transparent;color:var(--cp-muted,#bbb);border:1px solid var(--cp-border,#2a2a2a);border-radius:6px;padding:3px 6px;cursor:pointer;font:inherit;font-size:13px;line-height:1;">⚙</button>
      </div>
    </div>
    <a id="cp-update-banner" href="#" target="_blank" rel="noopener" style="display:none;padding:8px 12px;background:#1e3a8a;color:#dbeafe;font-size:12px;text-decoration:none;border-bottom:1px solid #1d4ed8;">
      <span id="cp-update-text"></span>
    </a>
    <div id="cp-follow-banner" style="display:none;padding:8px 12px;background:var(--cp-accent,#f97316);color:var(--cp-accent-text,#fff);font-size:12px;border-bottom:1px solid var(--cp-border,#333);align-items:center;justify-content:space-between;gap:8px;">
      <span id="cp-follow-text" style="flex:1;min-width:0;"></span>
      <button id="cp-follow-cancel" type="button" style="background:rgba(0,0,0,0.18);color:inherit;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font:inherit;font-size:11px;white-space:nowrap;">Stay here</button>
    </div>
    <div id="cp-settings-drawer" style="display:none;padding:10px 12px;border-bottom:1px solid var(--cp-border,#333);background:rgba(0,0,0,0.2);max-height:50vh;overflow-y:auto;font-size:12px;"></div>
    <form id="cp-name-form" style="padding:12px;display:none;flex-direction:column;gap:8px;">
      <label style="font-size:12px;color:var(--cp-muted,#bbb);">Pick a display name to join chat</label>
      <input id="cp-name-input" maxlength="32" placeholder="e.g. avi" autocomplete="off" style="padding:8px;background:var(--cp-input-bg,#111);border:1px solid var(--cp-border,#333);border-radius:6px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
      <button id="cp-name-submit" type="submit" disabled style="padding:8px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:6px;cursor:pointer;opacity:0.5;">Join chat</button>
    </form>
    <div id="cp-main" style="display:flex;flex-direction:column;flex:1;min-height:0;">
      <div style="padding:8px 12px;border-bottom:1px solid var(--cp-border,#2a2a2a);display:flex;flex-direction:column;gap:6px;">
        <button id="cp-copy" style="width:100%;padding:7px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:6px;cursor:pointer;font:inherit;">Copy room link</button>
        <button id="cp-bring" title="Bring everyone in the room to the page you're on now" style="display:none;width:100%;padding:7px;background:transparent;color:var(--cp-accent,#f97316);border:1px solid var(--cp-accent,#f97316);border-radius:6px;cursor:pointer;font:inherit;font-size:12px;">📍 Bring everyone here</button>
        <button id="cp-share-onboard" title="Sends friends through install steps first" style="width:100%;padding:6px;background:transparent;color:var(--cp-muted,#bbb);border:1px solid var(--cp-border,#333);border-radius:6px;cursor:pointer;font:inherit;font-size:12px;">Copy onboarding link</button>
      </div>
      <div id="cp-key-wrap" style="padding:8px 12px;border-bottom:1px solid var(--cp-border,#2a2a2a);display:none;font-size:12px;color:var(--cp-muted,#bbb);">
        <button id="cp-key-toggle" type="button" style="background:none;border:none;color:var(--cp-muted,#bbb);cursor:pointer;padding:0;font:inherit;text-decoration:underline;">🔒 Add room key</button>
        <form id="cp-key-form" style="display:none;flex-direction:column;gap:6px;margin-top:6px;">
          <input id="cp-key-input" maxlength="64" placeholder="Out-of-band secret" autocomplete="off" style="padding:6px;background:var(--cp-input-bg,#111);border:1px solid var(--cp-border,#333);border-radius:4px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
          <div style="display:flex;gap:6px;">
            <button id="cp-key-save" type="submit" style="flex:1;padding:5px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
            <button id="cp-key-clear" type="button" style="padding:5px 10px;background:var(--cp-hover,#333);color:var(--cp-text,#eee);border:none;border-radius:4px;cursor:pointer;font:inherit;">Clear</button>
          </div>
          <div style="color:var(--cp-muted,#888);font-size:11px;line-height:1.3;">Friends need the new link to reconnect. Share the key separately for real protection.</div>
        </form>
      </div>
      <div id="cp-ffa-wrap" style="padding:8px 12px;border-bottom:1px solid var(--cp-border,#2a2a2a);display:none;">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
          <input type="checkbox" id="cp-ffa"/> Free-for-all controls
        </label>
      </div>
      <div id="cp-people" style="padding:12px;border-bottom:1px solid var(--cp-border,#2a2a2a);font-size:13px;color:var(--cp-text,#eee);max-height:168px;overflow-y:auto;"></div>
      <div id="cp-chat-wrap" style="flex:1;position:relative;display:flex;flex-direction:column;min-height:0;">
        <div id="cp-chat" style="flex:1;overflow-y:auto;padding:12px;font-size:inherit;min-height:0;display:flex;flex-direction:column;gap:8px;"></div>
        <div id="cp-reactions-float" style="position:absolute;left:0;right:0;bottom:0;height:0;pointer-events:none;overflow:visible;"></div>
      </div>
      <div id="cp-reactions" style="display:flex;gap:4px;padding:6px 12px;border-top:1px solid var(--cp-border,#2a2a2a);background:rgba(0,0,0,0.15);transition:opacity 200ms;">
        ${REACTION_EMOJIS.map(
          (e) => `<button type="button" data-emoji="${e}" class="cp-react-btn" style="flex:1;padding:4px 0;background:transparent;border:1px solid var(--cp-border,#2a2a2a);border-radius:6px;cursor:pointer;font-size:16px;line-height:1;">${e}</button>`,
        ).join("")}
        <button type="button" id="cp-react-more" title="Add an emoji to your message" style="flex:none;width:30px;padding:4px 0;background:transparent;border:1.5px dashed var(--cp-border,#2a2a2a);border-radius:6px;cursor:pointer;font-size:16px;line-height:1;color:var(--cp-muted,#888);">＋</button>
      </div>
      <div id="cp-typing" style="height:16px;padding:0 12px;font-size:11px;color:var(--cp-muted,#888);opacity:0;transition:opacity 200ms;line-height:16px;"></div>
      <form id="cp-form" style="display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--cp-border,#2a2a2a);">
        <input id="cp-input" placeholder="Message" style="flex:1;min-width:0;padding:8px 14px;background:var(--cp-input-bg,#111);border:1px solid var(--cp-border,#2a2a2a);border-radius:18px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
        <button id="cp-send" type="submit" title="Send" style="flex:none;width:30px;height:30px;border-radius:50%;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;cursor:pointer;font:inherit;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;">↑</button>
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
      .cp-react-btn:hover { background:var(--cp-hover,#222) !important; border-color:var(--cp-border,#444) !important; }
      .cp-react-btn:active { transform: scale(0.92); }
      #cp-react-more:hover { background:var(--cp-hover,#222) !important; color:var(--cp-text,#eee) !important; }
      #cp-react-more:active { transform: scale(0.92); }
      #cp-send:hover { filter: brightness(1.08); }
      #cp-send:active { transform: scale(0.92); }
      .cp-mode-btn[data-active="1"] { background:var(--cp-hover,#2a2a2a) !important; color:var(--cp-accent,#f97316) !important; }
      #cp-bring:hover { background:var(--cp-hover,#222) !important; }
      #avious-party-panel.cp-high-contrast { --cp-bg: #000 !important; --cp-text: #fff !important; --cp-bg-opacity: 1 !important; }
      .cp-people-row { display:flex; align-items:center; gap:9px; padding:4px 0; font-size:13px; }
      .cp-people-row button.cp-op-btn { background:transparent;border:1px solid var(--cp-border,#333);border-radius:4px;color:var(--cp-muted,#bbb);padding:1px 6px;cursor:pointer;font-size:10px; }
      .cp-people-row button.cp-op-btn:hover { background:var(--cp-hover,#222);border-color:var(--cp-border,#444); }
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
    // Internal grays + the danger button derive from the bg/text anchors via
    // color-mix, so every preset (incl. Light) and high-contrast stay legible
    // without per-preset gray fields. Values reference the vars set above, so
    // they recompute when bg/text change (including the high-contrast override).
    const derived: Record<string, string> = {
      "--cp-border": "color-mix(in srgb, var(--cp-text) 16%, var(--cp-bg))",
      "--cp-muted": "color-mix(in srgb, var(--cp-text) 55%, var(--cp-bg))",
      "--cp-input-bg": "color-mix(in srgb, var(--cp-text) 8%, var(--cp-bg))",
      "--cp-hover": "color-mix(in srgb, var(--cp-text) 14%, var(--cp-bg))",
    };
    for (const [k, v] of Object.entries(derived)) host.style.setProperty(k, v);
    // The pinned toggle tab lives outside the host, so set its vars too.
    tab.style.setProperty("--cp-bg", settings.bgColor);
    tab.style.setProperty("--cp-text", settings.textColor);
    tab.style.setProperty("--cp-border", derived["--cp-border"]!);
    host.style.backdropFilter = `blur(${settings.blur ?? 6}px)`;
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
          <div style="font-weight:600;margin-bottom:4px;color:var(--cp-muted,#bbb);">Display name</div>
          <form id="cp-rename-form" style="display:flex;gap:6px;">
            <input id="cp-rename-input" maxlength="32" value="${escapeAttr(currentName)}" style="flex:1;padding:5px;background:var(--cp-input-bg,#111);border:1px solid var(--cp-border,#333);border-radius:4px;color:var(--cp-text,#eee);outline:none;font:inherit;"/>
            <button type="submit" style="padding:5px 8px;background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border:none;border-radius:4px;cursor:pointer;font:inherit;">Save</button>
          </form>
        </section>
        <section>
          <div style="font-weight:600;margin-bottom:4px;color:var(--cp-muted,#bbb);">Theme</div>
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
          <div style="font-weight:600;margin-bottom:4px;color:var(--cp-muted,#bbb);">Appearance</div>
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
          <div style="font-weight:600;margin-bottom:4px;color:var(--cp-muted,#bbb);">Accessibility</div>
          <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span>Colorblind mode</span>
            <select id="cp-set-cb" style="background:var(--cp-input-bg,#111);border:1px solid var(--cp-border,#333);color:var(--cp-text,#eee);padding:3px;border-radius:4px;font:inherit;">
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
          <div style="font-weight:600;margin-bottom:4px;color:var(--cp-muted,#bbb);">Behavior</div>
          <button id="cp-replay-tour" style="width:100%;padding:5px;background:var(--cp-hover,#333);color:var(--cp-text,#eee);border:none;border-radius:4px;cursor:pointer;font:inherit;margin-bottom:6px;">Replay onboarding tour</button>
          <button id="cp-deactivate" title="Closes the socket, tears down the chat, and remembers this site as off. Click the 🎬 button in the corner to turn it back on." style="width:100%;padding:5px;background:color-mix(in srgb, #ef4444 16%, var(--cp-bg,#141416));color:#ef4444;border:1px solid color-mix(in srgb, #ef4444 40%, var(--cp-bg,#141416));border-radius:4px;cursor:pointer;font:inherit;">Turn off Watch-Party here</button>
          <div style="font-size:11px;color:var(--cp-muted,#777);margin-top:4px;line-height:1.4;">Dismisses the chat for this site. The 🎬 button in the corner reactivates. Invite links auto-reactivate.</div>
        </section>
        <section style="font-size:11px;color:var(--cp-muted,#777);border-top:1px solid var(--cp-border,#2a2a2a);padding-top:8px;">
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
        if (preset.opacity !== undefined) settings.opacity = preset.opacity;
        settings.blur = preset.blur ?? 6;
        saveSettings(settings);
        applyTheme();
        // Sync the color pickers + active ring to the chosen preset.
        ($("#cp-set-bg") as HTMLInputElement).value = preset.bgColor;
        ($("#cp-set-text") as HTMLInputElement).value = preset.textColor;
        ($("#cp-set-accent") as HTMLInputElement).value = preset.accent;
        ($("#cp-set-opacity") as HTMLInputElement).value = String(settings.opacity);
        ($("#cp-opacity-val") as HTMLSpanElement).textContent = settings.opacity.toFixed(2);
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
  ($("#cp-bring") as HTMLButtonElement).addEventListener("click", () => hooks.onBringEveryone());
  ($("#cp-share-onboard") as HTMLButtonElement).addEventListener("click", () => hooks.onShareForNonInstallers());

  // ─────────────────────────── Follow banner ─────────────────────────────────
  const followBanner = $("#cp-follow-banner") as HTMLDivElement;
  const followText = $("#cp-follow-text") as HTMLSpanElement;
  const followCancel = $("#cp-follow-cancel") as HTMLButtonElement;
  let followCancelCb: (() => void) | null = null;
  followCancel.addEventListener("click", () => followCancelCb?.());
  function setFollowBanner(text: string, onCancel: () => void) {
    followText.textContent = text;
    followCancelCb = onCancel;
    followBanner.style.display = "flex";
  }
  function hideFollowBanner() {
    followBanner.style.display = "none";
    followCancelCb = null;
  }
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
  // The "＋" at the end of the reaction row focuses the message box so the OS
  // emoji picker (⌃⌘Space on macOS) can drop any emoji into your message.
  // Custom broadcast reactions would need a protocol change — tracked separately.
  (host.querySelector("#cp-react-more") as HTMLButtonElement | null)?.addEventListener("click", () => input.focus());

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
    const header = `<div style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--cp-muted,#888);margin-bottom:8px;">In the room · ${currentParticipants.length}</div>`;
    const rows = currentParticipants
      .map((p) => {
        const isYou = p.id === currentYou;
        const color = colorFor(p.id, settings.colorblind);
        const initial = escapeHtml((p.name.trim()[0] || "?").toUpperCase());
        const crown = p.isAdmin ? `<span style="font-size:11px;">👑</span>` : "";
        const star = !p.isAdmin && p.isOperator ? `<span style="font-size:11px;">⭐</span>` : "";
        const avatar = `<span style="position:relative;width:26px;height:26px;flex:none;">
            <span style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">${initial}</span>
            <span style="position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:#34c759;border:2px solid var(--cp-bg,#141416);"></span>
          </span>`;
        const trailing = isYou
          ? `<span style="margin-left:auto;color:var(--cp-muted,#888);font-size:11px;">you</span>`
          : youIsAdmin && !p.isAdmin
            ? p.isOperator
              ? `<button class="cp-op-btn" data-action="demote" data-target="${p.id}" style="margin-left:auto;">remove ⭐</button>`
              : `<button class="cp-op-btn" data-action="promote" data-target="${p.id}" style="margin-left:auto;">give ⭐</button>`
            : "";
        return `<div class="cp-people-row">
          ${avatar}
          <span style="color:${color};font-weight:${isYou ? "500" : "400"};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span>${crown}${star}
          ${trailing}
        </div>`;
      })
      .join("");
    peopleEl.innerHTML = header + rows;
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
    // "Bring everyone here" is a drive action — show it to admin + operators.
    const canDrive = s.canDrive ?? isAdmin;
    ($("#cp-bring") as HTMLButtonElement).style.display = canDrive ? "block" : "none";
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
  // iMessage-style bubbles: your messages hug the right in the accent color;
  // everyone else's sit left in a muted fill. Consecutive messages from the
  // same sender group — only the first shows the (colored) name label, matching
  // the mockup. All colors come from theme tokens so bubbles track every preset.
  function renderChatLine(rec: ChatRecord) {
    const isMine = rec.from === currentYou;
    const idx = chatLog.indexOf(rec);
    const prev = idx > 0 ? chatLog[idx - 1] : undefined;
    const groupStart = !prev || prev.from !== rec.from;
    const color = colorFor(rec.from, settings.colorblind);
    const liveName = nameMap.get(rec.from) ?? "…";
    rec.el.style.cssText = `display:flex;flex-direction:column;align-items:${isMine ? "flex-end" : "flex-start"};align-self:${isMine ? "flex-end" : "flex-start"};max-width:82%;`;
    const nameLabel =
      !isMine && groupStart
        ? `<span style="font-size:10px;color:${color};margin:0 0 2px 12px;">${escapeHtml(liveName)}</span>`
        : "";
    const bubbleStyle = isMine
      ? "background:var(--cp-accent,#2563eb);color:var(--cp-accent-text,#fff);border-radius:17px;border-bottom-right-radius:5px;"
      : "background:var(--cp-hover,#333);color:var(--cp-text,#eee);border-radius:17px;border-bottom-left-radius:5px;";
    const tsLine = settings.showTimestamps
      ? `<span style="font-size:9px;color:var(--cp-muted,#888);margin:2px ${isMine ? "8px" : "0"} 0 ${isMine ? "0" : "12px"};">${fmtTs(rec.ts)}</span>`
      : "";
    rec.el.innerHTML = `${nameLabel}<span data-cp-from="${rec.from}" style="${bubbleStyle}padding:7px 12px;line-height:1.35;word-break:break-word;">${escapeHtml(rec.text)}</span>${tsLine}`;
  }
  function appendChat(id: ClientId, name: string, text: string, ts: number = Date.now()) {
    nameMap.set(id, name);
    const div = document.createElement("div");
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
    div.style.cssText = "align-self:center;color:var(--cp-muted,#888);font-style:italic;font-size:11px;text-align:center;max-width:90%;";
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
    setFollowBanner,
    hideFollowBanner,
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
