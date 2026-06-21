"use strict";
(() => {
  // client/extension/background.ts
  var SOCKET_GRACE_MIN = 0.5;
  var CROSS_DOMAIN_GRACE_MIN = 3;
  var KEY = (tabId) => `wp:${tabId}`;
  var SOCKET_ALARM = (tabId) => `wp-socket-grace:${tabId}`;
  var CROSS_ALARM = (tabId) => `wp-cross-grace:${tabId}`;
  function originOf(url) {
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  }
  function hasPartyHash(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      const params = new URLSearchParams(u.hash.replace(/^#/, ""));
      const party = params.get("party");
      return !!party && party.length > 0;
    } catch {
      return false;
    }
  }
  async function getActivation(tabId) {
    const out = await chrome.storage.session.get(KEY(tabId));
    const v = out[KEY(tabId)];
    return v ?? null;
  }
  async function setActivation(tabId, value) {
    await chrome.storage.session.set({ [KEY(tabId)]: value });
  }
  async function clearActivation(tabId) {
    await chrome.storage.session.remove(KEY(tabId));
  }
  async function inject(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"]
      });
    } catch (e) {
      console.warn("[watch-party] inject failed", e);
    }
  }
  async function send(tabId, msg) {
    try {
      await chrome.tabs.sendMessage(tabId, msg);
    } catch {
    }
  }
  async function setIcon(tabId, active) {
    await Promise.all([
      chrome.action.setBadgeText({ tabId, text: active ? "ON" : "" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#f97316" }),
      chrome.action.setTitle({ tabId, title: active ? "Watch-Party (on \u2014 click to turn off)" : "Watch-Party (off \u2014 click to turn on)" })
    ]);
  }
  async function activate(tabId, url) {
    const origin = originOf(url);
    await setActivation(tabId, { origin, activatedAt: Date.now() });
    await chrome.alarms.clear(SOCKET_ALARM(tabId));
    await chrome.alarms.clear(CROSS_ALARM(tabId));
    await send(tabId, { type: "wp-remount" });
    await inject(tabId);
    await setIcon(tabId, true);
  }
  async function deactivate(tabId) {
    await clearActivation(tabId);
    await chrome.alarms.clear(CROSS_ALARM(tabId));
    await send(tabId, { type: "wp-deactivate" });
    chrome.alarms.create(SOCKET_ALARM(tabId), { delayInMinutes: SOCKET_GRACE_MIN });
    await setIcon(tabId, false);
  }
  chrome.action.onClicked.addListener(async (tab) => {
    if (typeof tab.id !== "number" || !tab.url) return;
    const current = await getActivation(tab.id);
    if (current) await deactivate(tab.id);
    else await activate(tab.id, tab.url);
  });
  chrome.webNavigation.onCommitted.addListener(async (d) => {
    if (d.frameId !== 0) return;
    const act = await getActivation(d.tabId);
    if (!act) {
      if (hasPartyHash(d.url)) await activate(d.tabId, d.url);
      return;
    }
    const newOrigin = originOf(d.url);
    if (newOrigin === act.origin) {
      await chrome.alarms.clear(CROSS_ALARM(d.tabId));
      await inject(d.tabId);
      await setIcon(d.tabId, true);
    } else if (newOrigin) {
      if (hasPartyHash(d.url)) {
        await chrome.alarms.clear(CROSS_ALARM(d.tabId));
        await activate(d.tabId, d.url);
      } else {
        chrome.alarms.create(CROSS_ALARM(d.tabId), { delayInMinutes: CROSS_DOMAIN_GRACE_MIN });
        await setIcon(d.tabId, false);
      }
    }
  });
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(async (d) => {
    if (d.frameId !== 0) return;
    const act = await getActivation(d.tabId);
    if (act) return;
    if (hasPartyHash(d.url)) await activate(d.tabId, d.url);
  });
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    await clearActivation(tabId);
    await chrome.alarms.clear(SOCKET_ALARM(tabId));
    await chrome.alarms.clear(CROSS_ALARM(tabId));
  });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    const socketMatch = /^wp-socket-grace:(\d+)$/.exec(alarm.name);
    if (socketMatch) {
      const tabId = Number(socketMatch[1]);
      const act = await getActivation(tabId);
      if (!act) await send(tabId, { type: "wp-hard-disconnect" });
      return;
    }
    const crossMatch = /^wp-cross-grace:(\d+)$/.exec(alarm.name);
    if (crossMatch) {
      const tabId = Number(crossMatch[1]);
      await clearActivation(tabId);
      await send(tabId, { type: "wp-hard-disconnect" });
      await setIcon(tabId, false);
      return;
    }
  });
})();
