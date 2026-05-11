import type { Participant } from "../../../shared/protocol";

export interface PanelState {
  you: string;
  adminId: string;
  freeForAll: boolean;
  participants: Participant[];
  roomUrl: string;
}

export interface PanelHooks {
  onToggleFFA: (next: boolean) => void;
  onSendChat: (text: string) => void;
  onCopyLink: () => void;
}

export function mountPanel(hooks: PanelHooks) {
  const host = document.createElement("div");
  host.id = "cineby-party-panel";
  host.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; width: 280px;
    background: rgba(20,20,22,0.95); color: #eee; font: 13px system-ui, sans-serif;
    border: 1px solid #333; border-radius: 10px; z-index: 2147483647;
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; max-height: 60vh;
  `;
  host.innerHTML = `
    <div id="cp-header" style="padding:8px 10px;border-bottom:1px solid #333;cursor:move;display:flex;justify-content:space-between;align-items:center;">
      <span>🎬 Cineby Party</span>
      <button id="cp-collapse" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:14px;">–</button>
    </div>
    <div id="cp-body" style="display:flex;flex-direction:column;min-height:0;">
      <div style="padding:8px 10px;border-bottom:1px solid #2a2a2a;">
        <button id="cp-copy" style="width:100%;padding:6px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">Copy room link</button>
      </div>
      <div id="cp-ffa-wrap" style="padding:8px 10px;border-bottom:1px solid #2a2a2a;display:none;">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
          <input type="checkbox" id="cp-ffa"/> Free-for-all controls
        </label>
      </div>
      <div id="cp-people" style="padding:8px 10px;border-bottom:1px solid #2a2a2a;font-size:12px;color:#bbb;"></div>
      <div id="cp-chat" style="flex:1;overflow-y:auto;padding:8px 10px;font-size:12px;min-height:80px;"></div>
      <form id="cp-form" style="display:flex;border-top:1px solid #2a2a2a;">
        <input id="cp-input" placeholder="Say something…" style="flex:1;padding:8px;background:transparent;border:none;color:#eee;outline:none;font:inherit;"/>
        <button style="background:none;border:none;color:#2563eb;padding:0 10px;cursor:pointer;">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(host);

  const $ = <T extends HTMLElement>(id: string) => host.querySelector(id) as T;
  const body = $("#cp-body") as HTMLDivElement;
  const collapseBtn = $("#cp-collapse") as HTMLButtonElement;
  collapseBtn.addEventListener("click", () => {
    body.style.display = body.style.display === "none" ? "flex" : "none";
    collapseBtn.textContent = body.style.display === "none" ? "+" : "–";
  });
  ($("#cp-copy") as HTMLButtonElement).addEventListener("click", () => hooks.onCopyLink());
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

  // drag
  const header = $("#cp-header") as HTMLDivElement;
  let dragOffset: { x: number; y: number } | null = null;
  header.addEventListener("mousedown", (e) => {
    const r = host.getBoundingClientRect();
    dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragOffset) return;
    host.style.left = `${e.clientX - dragOffset.x}px`;
    host.style.top = `${e.clientY - dragOffset.y}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  });
  window.addEventListener("mouseup", () => (dragOffset = null));

  function setState(s: PanelState) {
    const isAdmin = s.you === s.adminId;
    ($("#cp-ffa-wrap") as HTMLDivElement).style.display = isAdmin ? "block" : "none";
    ffa.checked = s.freeForAll;
    ($("#cp-people") as HTMLDivElement).innerHTML = s.participants
      .map((p) => `<div>${p.isAdmin ? "👑 " : ""}${escapeHtml(p.name)}${p.id === s.you ? " (you)" : ""}</div>`)
      .join("");
  }

  function appendChat(name: string, text: string) {
    const div = document.createElement("div");
    div.style.marginBottom = "4px";
    div.innerHTML = `<b style="color:#60a5fa;">${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    const chat = $("#cp-chat") as HTMLDivElement;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function appendSystem(text: string) {
    const div = document.createElement("div");
    div.style.cssText = "color:#888;font-style:italic;margin-bottom:4px;";
    div.textContent = text;
    const chat = $("#cp-chat") as HTMLDivElement;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  return { setState, appendChat, appendSystem };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
