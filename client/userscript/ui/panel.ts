import type { Participant } from "../../../shared/protocol";
import {
  DEFAULTS,
  FONT_PX,
  PALETTE_LABELS,
  type Palette,
  type Settings,
  getSettings,
  loadSettings,
  onSettingsChange,
  updateSettings,
} from "../../extension/lib/settings";
import { EMOJI, EMOJI_CATEGORIES } from "../../extension/lib/emoji";
import {
  notifyPermission,
  playNotifySound,
  requestNotifyPermission,
  showPush,
} from "../../extension/lib/notify";
import css from "../../extension/styles/chat.css";

export interface PanelState {
  you: string;
  adminId: string;
  freeForAll: boolean;
  participants: Participant[];
  roomUrl: string;
  passphrase?: string | null;
  hostName?: string | null;
}

export interface PanelHooks {
  onToggleFFA: (next: boolean) => void;
  onSendChat: (text: string) => void;
  onCopyLink: () => void;
  onSubmitUsername: (name: string) => void;
  onSetKey: (key: string | null) => void;
  onFollowVideo: (url: string) => void;
}

const PALETTES_ORDER: Palette[] = ["dusk", "ember", "clay", "espresso", "moss", "mustard", "linen"];
const FONT_OPTIONS: Array<[Settings["font_family"], string]> = [
  ["mosvita", "Mosvita"],
  ["new-astro", "New Astro"],
  ["system", "System"],
];
const SIZE_OPTIONS: Array<[Settings["font_size"], string]> = [["sm", "S"], ["md", "M"], ["lg", "L"]];

const SVG = {
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  cog: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82 2 2 0 1 1-2.83 2.83 1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51 2 2 0 0 1-4 0 1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33 2 2 0 1 1-2.83-2.83 1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1 2 2 0 0 1 0-4 1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82 2 2 0 1 1 2.83-2.83 1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51 2 2 0 0 1 4 0 1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33 2 2 0 1 1 2.83 2.83 1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1 2 2 0 0 1 0 4 1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,
  chevR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`,
  chevL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`,
  emoji: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4"/><path d="M18 5l3 3"/><path d="M15 8l3 3"/></svg>`,
};

const AVATAR_BG = ["#D39203", "#A24617", "#797028", "#F1ECE1", "#4E0000", "#1A243D"];
const AVATAR_FG = ["#241916", "#F1ECE1", "#F1ECE1", "#241916", "#F1ECE1", "#F1ECE1"];

let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.id = "avious-party-style";
  tag.textContent = css as unknown as string;
  document.head.appendChild(tag);
  injectStyles_fonts();
  styleInjected = true;
}

// Bundled fonts — only available in the extension build, where chrome.runtime.getURL resolves.
function injectStyles_fonts() {
  const c = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }).chrome;
  const getURL = c?.runtime?.getURL;
  if (!getURL) return;
  const fontCss = `
    @font-face { font-family: "New Astro"; src: url(${JSON.stringify(getURL("assets/fonts/New_Astro_Regular.ttf"))}) format("truetype"); font-weight: 400; font-display: swap; }
    @font-face { font-family: "Mosvita"; src: url(${JSON.stringify(getURL("assets/fonts/mosvita-regular.otf"))}) format("opentype"); font-weight: 400; font-display: swap; }
    @font-face { font-family: "Mosvita"; src: url(${JSON.stringify(getURL("assets/fonts/mosvita-medium.otf"))}) format("opentype"); font-weight: 500; font-display: swap; }
    @font-face { font-family: "Mosvita"; src: url(${JSON.stringify(getURL("assets/fonts/mosvita-bold.otf"))}) format("opentype"); font-weight: 700; font-display: swap; }
  `;
  const tag = document.createElement("style");
  tag.id = "avious-party-fonts";
  tag.textContent = fontCss;
  document.head.appendChild(tag);
}

function avatarFor(name: string): { bg: string; fg: string; letter: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const idx = h % AVATAR_BG.length;
  return { bg: AVATAR_BG[idx]!, fg: AVATAR_FG[idx]!, letter: (name[0] || "?").toUpperCase() };
}

export function mountPanel(hooks: PanelHooks, initialUsername?: string) {
  injectStyles();
  // Best-effort prime — fire-and-forget; UI works with DEFAULTS until it resolves.
  void loadSettings();

  const host = document.createElement("div");
  host.id = "avious-party-host";
  host.dataset.collapsed = "false";

  applyTheme(host, getSettings());

  host.innerHTML = `
    <button class="ap-arrow" type="button" title="Open Watch-Party" style="display:none;">
      ${SVG.chevL}
      <span class="ap-arrow-badge" hidden>0</span>
    </button>
    <div class="ap-sidebar">
      <div class="ap-head">
        <span class="ap-mark">W</span>
        <span class="ap-title">Watch-Party</span>
        <span class="ap-spacer"></span>
        <button class="ap-iconbtn" data-act="copy" title="Copy invite link">${SVG.copy}</button>
        <button class="ap-iconbtn" data-act="settings" title="Settings">${SVG.cog}</button>
        <button class="ap-iconbtn" data-act="collapse" title="Hide sidebar">${SVG.chevR}</button>
      </div>
      <a class="ap-update" data-act="update" href="#" target="_blank" rel="noopener" hidden></a>
      <form class="ap-name-form" data-act="name-form">
        <label>Pick a display name to join chat</label>
        <input class="ap-input" data-act="name-input" maxlength="32" placeholder="e.g. avi" autocomplete="off" />
        <button class="ap-btn-primary" type="submit" disabled data-act="name-submit">Join chat</button>
      </form>
      <div class="ap-main" data-act="main">
        <div class="ap-controls" data-act="controls" hidden>
          <div class="ap-pill-row">
            <button class="ap-pill" type="button" data-act="ffa">🔓 Free-for-all</button>
            <button class="ap-pill" type="button" data-act="key-pill">🔒 Key</button>
            <span class="ap-host-tag" data-act="host-tag">HOST</span>
          </div>
          <form class="ap-key-form" data-act="key-form">
            <input class="ap-input" data-act="key-input" maxlength="64" placeholder="Out-of-band secret" autocomplete="off" />
            <div class="ap-key-actions">
              <button class="ap-btn-primary" type="submit">Save</button>
              <button class="ap-btn-secondary" type="button" data-act="key-clear">Clear</button>
            </div>
            <div class="ap-key-hint">Friends need the new link to reconnect. Share the key separately.</div>
          </form>
        </div>
        <div class="ap-participants" data-act="participants"></div>
        <div class="ap-perm" data-act="perm">
          <h4>Let your browser ping you?</h4>
          <p>Push notifications fire for every new chat message, even when this tab is focused. We only ask once.</p>
          <div class="ap-perm-actions">
            <button class="ap-primary" type="button" data-act="perm-allow">Allow notifications</button>
            <button type="button" data-act="perm-dismiss">Not now</button>
          </div>
        </div>
        <div class="ap-toast" data-act="toast">
          <div class="ap-toast-ico">▶</div>
          <div class="ap-toast-text" data-act="toast-text"></div>
          <button class="ap-toast-go" type="button" data-act="toast-go">Go</button>
          <button class="ap-toast-dismiss" type="button" data-act="toast-x" aria-label="Dismiss">×</button>
        </div>
        <div class="ap-chat" data-act="chat"></div>
        <form class="ap-composer" data-act="composer">
          <button class="ap-iconbtn" type="button" data-act="emoji-toggle" title="Emoji">${SVG.emoji}</button>
          <input class="ap-input" data-act="msg" placeholder="Message…" autocomplete="off" />
          <button class="ap-send" type="submit" aria-label="Send">${SVG.send}</button>
        </form>
        <div class="ap-emoji" data-act="emoji">
          <div class="ap-emoji-grid" data-act="emoji-grid"></div>
          <div class="ap-emoji-cats" data-act="emoji-cats"></div>
        </div>
      </div>
      <div class="ap-settings" data-act="settings-drawer"></div>
    </div>
  `;
  document.body.appendChild(host);

  const $ = <T extends HTMLElement>(act: string) => host.querySelector(`[data-act="${act}"]`) as T;

  // ---------- collapse / pull-out arrow ----------
  const arrow = host.querySelector(".ap-arrow") as HTMLButtonElement;
  const collapse = $<HTMLButtonElement>("collapse");
  const arrowBadge = host.querySelector(".ap-arrow-badge") as HTMLSpanElement;
  let unread = 0;

  function setCollapsed(c: boolean) {
    host.dataset.collapsed = c ? "true" : "false";
    arrow.style.display = c ? "grid" : "none";
    if (!c) { unread = 0; arrowBadge.hidden = true; arrowBadge.textContent = "0"; }
  }
  collapse.addEventListener("click", () => setCollapsed(true));
  arrow.addEventListener("click", () => {
    setCollapsed(false);
    if (!getSettings().arrow_pulse_seen) {
      void updateSettings({ arrow_pulse_seen: true });
    }
    arrow.classList.remove("ap-arrow-pulse");
  });
  // First-show pulse, once across all sessions
  if (!getSettings().arrow_pulse_seen) arrow.classList.add("ap-arrow-pulse");

  // ---------- header buttons ----------
  $<HTMLButtonElement>("copy" /* via .ap-iconbtn */);
  const copyBtn = host.querySelector('.ap-iconbtn[data-act="copy"]') as HTMLButtonElement;
  copyBtn.addEventListener("click", () => hooks.onCopyLink());
  const settingsBtn = host.querySelector('.ap-iconbtn[data-act="settings"]') as HTMLButtonElement;
  const settingsDrawer = $<HTMLDivElement>("settings-drawer");
  settingsBtn.addEventListener("click", () => openSettings());

  // ---------- name gate ----------
  const nameForm = $<HTMLFormElement>("name-form");
  const nameInput = $<HTMLInputElement>("name-input");
  const nameSubmit = $<HTMLButtonElement>("name-submit");
  const mainWrap = $<HTMLDivElement>("main");
  const stopProp = (e: Event) => e.stopPropagation();
  for (const ev of ["keydown", "keyup", "keypress"]) nameInput.addEventListener(ev, stopProp);
  nameInput.addEventListener("input", () => {
    const ok = nameInput.value.trim().length > 0;
    nameSubmit.disabled = !ok;
  });
  nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = nameInput.value.trim().slice(0, 32);
    if (!n) return;
    hooks.onSubmitUsername(n);
    revealChat();
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
  if (!initialUsername) showGate();

  // ---------- FFA + key ----------
  const ffaPill = $<HTMLButtonElement>("ffa");
  const keyPill = $<HTMLButtonElement>("key-pill");
  const keyForm = $<HTMLFormElement>("key-form");
  const keyInput = $<HTMLInputElement>("key-input");
  const controls = $<HTMLDivElement>("controls");
  for (const ev of ["keydown", "keyup", "keypress"]) keyInput.addEventListener(ev, stopProp);
  let ffaState = false;
  ffaPill.addEventListener("click", () => {
    ffaState = !ffaState;
    ffaPill.classList.toggle("ap-on", ffaState);
    ffaPill.textContent = ffaState ? "🔓 Free-for-all" : "🔒 Host only";
    hooks.onToggleFFA(ffaState);
  });
  keyPill.addEventListener("click", () => keyForm.classList.toggle("ap-open"));
  keyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = keyInput.value.trim().slice(0, 64);
    hooks.onSetKey(v.length ? v : null);
    keyForm.classList.remove("ap-open");
  });
  host.querySelector('[data-act="key-clear"]')!.addEventListener("click", () => {
    keyInput.value = "";
    hooks.onSetKey(null);
    keyForm.classList.remove("ap-open");
  });

  // ---------- chat + composer ----------
  const chatEl = $<HTMLDivElement>("chat");
  const composer = $<HTMLFormElement>("composer");
  const msgInput = $<HTMLInputElement>("msg");
  for (const ev of ["keydown", "keyup", "keypress"]) msgInput.addEventListener(ev, stopProp);
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = msgInput.value.trim();
    if (!t) return;
    hooks.onSendChat(t);
    msgInput.value = "";
    closeEmoji();
  });

  // ---------- emoji picker ----------
  const emojiToggleBtn = host.querySelector('.ap-iconbtn[data-act="emoji-toggle"]') as HTMLButtonElement;
  const emojiBox = $<HTMLDivElement>("emoji");
  const emojiGrid = $<HTMLDivElement>("emoji-grid");
  const emojiCats = $<HTMLDivElement>("emoji-cats");
  let activeCat: string = EMOJI_CATEGORIES[0] as string;
  function renderEmoji() {
    emojiGrid.innerHTML = (EMOJI[activeCat] ?? [])
      .map((e) => `<button type="button" data-emo="${e}">${e}</button>`).join("");
    emojiCats.innerHTML = EMOJI_CATEGORIES
      .map((c) => `<button type="button" data-cat="${c}" class="${c === activeCat ? "ap-on" : ""}">${EMOJI[c]?.[0] ?? c}</button>`).join("");
  }
  emojiGrid.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const emo = t.getAttribute("data-emo");
    if (!emo) return;
    msgInput.value += emo;
    msgInput.focus();
  });
  emojiCats.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const c = t.getAttribute("data-cat");
    if (!c) return;
    activeCat = c;
    renderEmoji();
  });
  function openEmoji() { emojiBox.classList.add("ap-open"); emojiToggleBtn.classList.add("ap-on"); }
  function closeEmoji() { emojiBox.classList.remove("ap-open"); emojiToggleBtn.classList.remove("ap-on"); }
  emojiToggleBtn.addEventListener("click", () => {
    if (emojiBox.classList.contains("ap-open")) closeEmoji();
    else { openEmoji(); renderEmoji(); }
  });
  // Hide emoji setting respects global toggle
  function applyEmojiVisibility() {
    emojiToggleBtn.style.display = getSettings().emoji_picker ? "" : "none";
    if (!getSettings().emoji_picker) closeEmoji();
  }
  applyEmojiVisibility();

  // ---------- permission card ----------
  const perm = $<HTMLDivElement>("perm");
  const permAllow = host.querySelector('[data-act="perm-allow"]') as HTMLButtonElement;
  const permDismiss = host.querySelector('[data-act="perm-dismiss"]') as HTMLButtonElement;
  permAllow.addEventListener("click", async () => {
    const r = await requestNotifyPermission();
    if (r === "granted") {
      perm.classList.remove("ap-open");
    } else {
      // user declined — flip the setting back off
      await updateSettings({ notifications_enabled: false });
      perm.classList.remove("ap-open");
    }
  });
  permDismiss.addEventListener("click", async () => {
    await updateSettings({ notifications_enabled: false });
    perm.classList.remove("ap-open");
  });
  function maybeShowPerm() {
    const s = getSettings();
    if (s.notifications_enabled && notifyPermission() === "default") {
      perm.classList.add("ap-open");
    } else {
      perm.classList.remove("ap-open");
    }
  }

  // ---------- follow-video toast ----------
  const toast = $<HTMLDivElement>("toast");
  const toastText = $<HTMLDivElement>("toast-text");
  const toastGo = host.querySelector('[data-act="toast-go"]') as HTMLButtonElement;
  const toastX = host.querySelector('[data-act="toast-x"]') as HTMLButtonElement;
  let pendingFollowUrl: string | null = null;
  toastGo.addEventListener("click", () => {
    if (pendingFollowUrl) hooks.onFollowVideo(pendingFollowUrl);
    toast.classList.remove("ap-open");
    pendingFollowUrl = null;
  });
  toastX.addEventListener("click", () => {
    toast.classList.remove("ap-open");
    pendingFollowUrl = null;
  });
  function showFollowToast(url: string, hostName: string | null) {
    pendingFollowUrl = url;
    toastText.innerHTML = `<b>${escapeHtml(hostName || "Host")}</b> switched to a new video.<br><span style="color: var(--ap-fg-dim); font-size: 11.5px;">Same domain — safe to follow.</span>`;
    toast.classList.add("ap-open");
  }

  // ---------- live settings ----------
  onSettingsChange((s) => {
    applyTheme(host, s);
    applyEmojiVisibility();
    maybeShowPerm();
    renderSettings();
  });
  maybeShowPerm();

  // ---------- settings drawer ----------
  function openSettings() {
    settingsDrawer.classList.add("ap-open");
    settingsBtn.classList.add("ap-on");
    renderSettings();
  }
  function closeSettings() {
    settingsDrawer.classList.remove("ap-open");
    settingsBtn.classList.remove("ap-on");
  }
  function renderSettings() {
    const s = getSettings();
    settingsDrawer.innerHTML = `
      <div class="ap-head">
        <span class="ap-title">Settings</span>
        <span class="ap-spacer"></span>
        <button class="ap-iconbtn" data-act="settings-close" title="Close">${SVG.x}</button>
      </div>
      <div class="ap-settings-body">
        <div class="ap-set-group">
          <div class="ap-set-label">Chat</div>
          <div class="ap-set-item">
            <div class="ap-si-label">Emoji picker<span class="ap-si-sub">Show 😊 in the composer</span></div>
            <button class="ap-toggle ${s.emoji_picker ? "ap-on" : ""}" data-set="emoji_picker"></button>
          </div>
          <div class="ap-set-item">
            <div class="ap-si-label">Sound on new message<span class="ap-si-sub">Quiet chime, mutable</span></div>
            <button class="ap-toggle ${s.sound_enabled ? "ap-on" : ""}" data-set="sound_enabled"></button>
          </div>
          <div class="ap-set-item">
            <div class="ap-si-label">Volume</div>
            <input type="range" class="ap-slider" min="0" max="100" value="${Math.round(s.sound_volume * 100)}" data-set="sound_volume" />
          </div>
          <div class="ap-set-item">
            <div class="ap-si-label">Browser notifications<span class="ap-si-sub">Fire even when this tab is focused</span></div>
            <button class="ap-toggle ${s.notifications_enabled ? "ap-on" : ""}" data-set="notifications_enabled"></button>
          </div>
        </div>
        <div class="ap-set-group">
          <div class="ap-set-label">Appearance</div>
          <div class="ap-set-item">
            <div class="ap-si-label">Font</div>
            <div class="ap-seg" data-set="font_family">
              ${FONT_OPTIONS.map(([v, label]) => `<button type="button" data-val="${v}" class="${s.font_family === v ? "ap-on" : ""}">${label}</button>`).join("")}
            </div>
          </div>
          <div class="ap-set-item">
            <div class="ap-si-label">Text size</div>
            <div class="ap-seg" data-set="font_size">
              ${SIZE_OPTIONS.map(([v, label]) => `<button type="button" data-val="${v}" class="${s.font_size === v ? "ap-on" : ""}">${label}</button>`).join("")}
            </div>
          </div>
          <div class="ap-set-item" style="display:block;">
            <div class="ap-si-label" style="margin-bottom: 10px;">Palette</div>
            <div class="ap-palette-grid">
              ${PALETTES_ORDER.map((p) => `<button type="button" class="ap-swatch ${s.palette === p ? "ap-on" : ""}" data-pal="${p}" title="${PALETTE_LABELS[p]}" style="background: ${swatchBg(p)};"></button>`).join("")}
            </div>
          </div>
        </div>
        <div class="ap-set-group">
          <div class="ap-set-label">Sync</div>
          <div class="ap-set-item">
            <div class="ap-si-label">Auto-follow host video changes<span class="ap-si-sub">Same-domain only</span></div>
            <button class="ap-toggle ${s.auto_follow_video ? "ap-on" : ""}" data-set="auto_follow_video"></button>
          </div>
        </div>
      </div>
    `;
    bindSettingsEvents();
  }
  function bindSettingsEvents() {
    settingsDrawer.querySelector('[data-act="settings-close"]')?.addEventListener("click", closeSettings);
    settingsDrawer.querySelectorAll<HTMLButtonElement>(".ap-toggle[data-set]").forEach((b) => {
      b.addEventListener("click", async () => {
        const key = b.getAttribute("data-set") as keyof Settings;
        const cur = getSettings()[key] as boolean;
        await updateSettings({ [key]: !cur } as Partial<Settings>);
      });
    });
    settingsDrawer.querySelectorAll<HTMLInputElement>(".ap-slider[data-set]").forEach((sl) => {
      sl.addEventListener("input", async () => {
        const key = sl.getAttribute("data-set") as keyof Settings;
        await updateSettings({ [key]: Number(sl.value) / 100 } as Partial<Settings>);
      });
    });
    settingsDrawer.querySelectorAll<HTMLDivElement>(".ap-seg[data-set]").forEach((seg) => {
      seg.addEventListener("click", async (e) => {
        const t = e.target as HTMLElement;
        const val = t.getAttribute("data-val");
        if (!val) return;
        const key = seg.getAttribute("data-set") as keyof Settings;
        await updateSettings({ [key]: val } as unknown as Partial<Settings>);
      });
    });
    settingsDrawer.querySelectorAll<HTMLButtonElement>(".ap-swatch[data-pal]").forEach((sw) => {
      sw.addEventListener("click", async () => {
        const pal = sw.getAttribute("data-pal") as Palette;
        await updateSettings({ palette: pal });
      });
    });
  }

  // ---------- public surface ----------
  function setState(s: PanelState) {
    const isAdmin = s.you === s.adminId;
    controls.hidden = !isAdmin;
    ffaState = s.freeForAll;
    ffaPill.classList.toggle("ap-on", ffaState);
    ffaPill.textContent = ffaState ? "🔓 Free-for-all" : "🔒 Host only";
    keyInput.value = s.passphrase ?? "";
    keyPill.textContent = s.passphrase ? "🔓 Key set" : "🔒 Add key";
    const parts = s.participants.slice(0, 6);
    const overflow = s.participants.length - parts.length;
    const partsEl = $<HTMLDivElement>("participants");
    partsEl.innerHTML = parts.map((p) => {
      const a = avatarFor(p.name);
      return `<div class="ap-avatar" title="${escapeHtml(p.name)}${p.isAdmin ? " (host)" : ""}${p.id === s.you ? " — you" : ""}" style="background:${a.bg};color:${a.fg};">${a.letter}</div>`;
    }).join("") + (overflow > 0 ? `<span class="ap-participants-overflow">+${overflow}</span>` : "");
  }

  function appendChat(name: string, text: string, opts?: { fromMe?: boolean; system?: boolean }) {
    const div = document.createElement("div");
    div.className = "ap-msg" + (opts?.fromMe ? " ap-me" : "") + (opts?.system ? " ap-sys" : "");
    if (opts?.system) {
      div.innerHTML = `<div class="ap-text">${escapeHtml(text)}</div>`;
    } else {
      div.innerHTML = `<div class="ap-who"><b>${escapeHtml(name)}</b></div><div class="ap-text">${escapeHtml(text)}</div>`;
    }
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
    if (!opts?.system && !opts?.fromMe) {
      playNotifySound();
      showPush(`${name} · Watch-Party`, text.length > 80 ? text.slice(0, 80) + "…" : text);
      if (host.dataset.collapsed === "true") {
        unread += 1;
        arrowBadge.textContent = String(unread);
        arrowBadge.hidden = false;
      }
    }
  }

  function appendSystem(text: string) {
    appendChat("", text, { system: true });
  }

  function showUpdateBanner(latestTag: string, href: string) {
    const banner = host.querySelector('[data-act="update"]') as HTMLAnchorElement;
    banner.textContent = `Update available: ${latestTag} — click to download`;
    banner.href = href;
    banner.hidden = false;
  }

  return {
    setState,
    appendChat,
    appendSystem,
    revealChat,
    showUpdateBanner,
    showFollowToast,
    isCollapsed: () => host.dataset.collapsed === "true",
    setCollapsed,
  };
}

function applyTheme(host: HTMLElement, s: Settings) {
  for (const c of Array.from(host.classList)) if (c.startsWith("ap-theme-")) host.classList.remove(c);
  host.classList.add(`ap-theme-${s.palette}`);
  host.style.setProperty("--ap-font",
    s.font_family === "new-astro" ? '"New Astro"' :
    s.font_family === "system" ? "system-ui" : '"Mosvita"');
  host.style.setProperty("--ap-font-px", `${FONT_PX[s.font_size]}px`);
}

function swatchBg(p: Palette): string {
  const map: Record<Palette, string> = {
    dusk: "#1A243D",
    ember: "#4E0000",
    clay: "#A24617",
    espresso: "#241916",
    moss: "#797028",
    mustard: "#D39203",
    linen: "#F1ECE1",
  };
  return map[p];
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Make TS happy about DEFAULTS being referenced if tree-shaking gets aggressive.
void DEFAULTS;
