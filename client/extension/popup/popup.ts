// Toolbar popup. Talks to the active tab's content script (and the background
// service worker) via chrome.runtime messages. No relay calls from here — the
// content script owns the WebSocket.

import { loadSettings, getSettings, updateSettings } from "../lib/settings";

declare const VERSION: string;
declare const LANDING_URL: string;

type TabState =
  | { kind: "no-content" }                    // content script not loaded (e.g. chrome:// pages)
  | { kind: "dormant" }                       // loaded but not in a room
  | { kind: "in-room"; isHost: boolean; roomUrl: string; count: number; hostName: string | null };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const subEl = $<HTMLSpanElement>("#pop-sub");
const statusEl = $<HTMLDivElement>("#pop-status");
const statusText = $<HTMLSpanElement>("#pop-status-text");
const startBtn = $<HTMLButtonElement>("#pop-start");
const copyBtn = $<HTMLButtonElement>("#pop-copy");
const masterBtn = $<HTMLButtonElement>("#pop-master");
const toastEl = $<HTMLDivElement>("#pop-toast");
const versionEl = $<HTMLSpanElement>("#pop-version");
const landingLink = $<HTMLAnchorElement>("#pop-landing");

versionEl.textContent = "v" + VERSION;
landingLink.href = LANDING_URL;
landingLink.textContent = LANDING_URL.replace(/^https?:\/\//, "");

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1600);
}

function setStatus(state: TabState) {
  startBtn.disabled = false;
  copyBtn.disabled = true;
  statusEl.classList.remove("live", "host");

  if (state.kind === "no-content") {
    subEl.textContent = "this page can't host a party";
    statusText.textContent = "Browser internals — extensions can't run here";
    startBtn.disabled = true;
    return;
  }
  if (state.kind === "dormant") {
    subEl.textContent = "no room on this tab";
    statusText.textContent = "Dormant — no room signature on this URL";
    return;
  }
  if (state.kind === "in-room") {
    statusEl.classList.add(state.isHost ? "host" : "live");
    if (state.isHost) {
      subEl.textContent = `you're hosting · ${state.count} ${state.count === 1 ? "person" : "people"}`;
      statusText.textContent = `Hosting · ${state.count} connected`;
    } else {
      const who = state.hostName ? `${state.hostName} is host` : "joined";
      subEl.textContent = `${who} · ${state.count} ${state.count === 1 ? "person" : "people"}`;
      statusText.textContent = `Connected · ${state.count} ${state.count === 1 ? "person" : "people"}`;
    }
    startBtn.disabled = true;
    copyBtn.disabled = false;
  }
}

async function sendToActiveTab<T>(message: unknown): Promise<T | null> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve),
  );
  const tab = tabs[0];
  if (!tab?.id) return null;
  return new Promise<T | null>((resolve) => {
    try {
      chrome.tabs.sendMessage(tab.id!, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve((response as T) ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

type StatusResponse = { inRoom: boolean; isHost: boolean; roomUrl: string; count: number; hostName: string | null };
type StartResponse = { roomUrl: string };
type CopyResponse = { roomUrl: string };

async function refresh() {
  const settings = getSettings();
  masterBtn.classList.toggle("on", settings.master_enabled);

  const resp = await sendToActiveTab<StatusResponse>({ kind: "ap.status" });
  if (!resp) {
    setStatus({ kind: "no-content" });
    return;
  }
  if (!resp.inRoom) {
    setStatus({ kind: "dormant" });
    return;
  }
  setStatus({ kind: "in-room", isHost: resp.isHost, roomUrl: resp.roomUrl, count: resp.count, hostName: resp.hostName });
}

startBtn.addEventListener("click", async () => {
  const resp = await sendToActiveTab<StartResponse>({ kind: "ap.start" });
  if (resp?.roomUrl) {
    try { await navigator.clipboard.writeText(resp.roomUrl); toast("Invite link copied"); }
    catch { toast("Started — copy the link from the sidebar"); }
    setTimeout(refresh, 200);
  } else {
    toast("Couldn't start here");
  }
});

copyBtn.addEventListener("click", async () => {
  const resp = await sendToActiveTab<CopyResponse>({ kind: "ap.copy" });
  if (resp?.roomUrl) {
    try { await navigator.clipboard.writeText(resp.roomUrl); toast("Invite link copied"); }
    catch { toast("Copy failed"); }
  }
});

masterBtn.addEventListener("click", async () => {
  const cur = getSettings();
  await updateSettings({ master_enabled: !cur.master_enabled });
  masterBtn.classList.toggle("on", !cur.master_enabled);
  toast(!cur.master_enabled ? "Watch-Party is on" : "Watch-Party paused");
  // Tell all content scripts to re-evaluate. Best-effort.
  try { chrome.runtime.sendMessage({ kind: "ap.masterChanged" }); } catch {}
  setTimeout(refresh, 150);
});

(async function init() {
  await loadSettings();
  await refresh();
})();
