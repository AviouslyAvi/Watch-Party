import type { Participant } from "../../../shared/protocol";

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
  onSetKey: (key: string | null) => void;
}

const SIDEBAR_WIDTH = 320;

export function mountPanel(hooks: PanelHooks, initialUsername?: string) {
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
      cursor:pointer; font-size:14px; padding:0;">›</button>
    <div id="cp-header" style="padding:10px 12px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-weight:600;color:#f97316;">🎬 Watch-Party</span>
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
        <button id="cp-key-toggle" type="button" style="background:none;border:none;color:#bbb;cursor:pointer;padding:0;font:inherit;text-decoration:underline;">🔒 Add room key</button>
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
        <input id="cp-input" placeholder="Type a message…" style="flex:1;padding:10px;background:transparent;border:none;color:#eee;outline:none;font:inherit;"/>
        <button style="background:none;border:none;color:#2563eb;padding:0 12px;cursor:pointer;font:inherit;">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(host);

  const $ = <T extends HTMLElement>(id: string) => host.querySelector(id) as T;

  let collapsed = false;
  const tab = $("#cp-tab") as HTMLButtonElement;
  tab.addEventListener("click", () => {
    collapsed = !collapsed;
    host.style.transform = collapsed ? `translateX(${SIDEBAR_WIDTH}px)` : "translateX(0)";
    tab.textContent = collapsed ? "‹" : "›";
  });

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
    hooks.onSubmitUsername(n);
    revealChat();
  });
  if (!initialUsername) showGate();

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

  function setState(s: PanelState) {
    const isAdmin = s.you === s.adminId;
    ($("#cp-ffa-wrap") as HTMLDivElement).style.display = isAdmin ? "block" : "none";
    keyWrap.style.display = isAdmin ? "block" : "none";
    keyToggle.textContent = s.passphrase ? "🔓 Key set — change or clear" : "🔒 Add room key";
    keyInput.value = s.passphrase ?? "";
    ffa.checked = s.freeForAll;
    ($("#cp-people") as HTMLDivElement).innerHTML = s.participants
      .map((p) => `<div>${p.isAdmin ? "👑 " : ""}${escapeHtml(p.name)}${p.id === s.you ? " (you)" : ""}</div>`)
      .join("");
  }

  function appendChat(name: string, text: string) {
    const div = document.createElement("div");
    div.style.marginBottom = "6px";
    div.innerHTML = `<b style="color:#60a5fa;">${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    const chat = $("#cp-chat") as HTMLDivElement;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
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

  return { setState, appendChat, appendSystem, revealChat, showUpdateBanner };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
