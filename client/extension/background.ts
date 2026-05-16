// Service worker. Two jobs:
//   1) Fan out master-kill changes to all tabs (the popup writes to chrome.storage,
//      content scripts listen, but a nudge speeds up the unmount).
//   2) Open the landing page if the popup link is clicked from a context where
//      target=_blank doesn't work in MV3 popups (some Chrome builds).
// Everything else (status / start / copy) is a direct popup ↔ content-script message.

chrome.runtime.onMessage.addListener((msg, sender, _sendResponse) => {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as { kind?: string };
  if (m.kind === "ap.masterChanged") {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (!t.id) continue;
        try { chrome.tabs.sendMessage(t.id, { kind: "ap.masterChanged" }, () => void chrome.runtime.lastError); } catch {}
      }
    });
  }
  return false;
});
