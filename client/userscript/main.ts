import { createSyncClient, type VideoAdapter } from "../../shared/sync";
import type { WireMsg, Participant, ClientId } from "../../shared/protocol";
import { IFRAME_TAG } from "./iframe-bridge";
import { mountPanel } from "./ui/panel";
import { hasOnboarded, resetOnboarded, runCoachmark } from "./ui/coachmark";
import { setHostDisabled } from "./ui/activator";

declare const WS_URL: string;
declare const VERSION: string;
declare const RELEASES_API: string;
declare const RELEASES_URL: string;

const LANDING_ORIGIN = "https://watch-party.pages.dev";

export interface BootHandle {
  teardownUI: () => void;
  remountUI: () => void;
  shutdown: () => void;
  /** Copy the current room invite link to clipboard. Used by site-adapter buttons. */
  copyInviteLink: () => void;
}

export function bootTopFrame(onDeactivated?: () => void): BootHandle {
  let me = loadStoredName() ?? "";
  const initial = ensureRoom();
  const roomId = initial.roomId;
  let passphrase: string | null = initial.passphrase;
  const currentRoomUrl = () => roomLinkForCurrent(roomId, passphrase);

  let you = "";
  let adminId = "";
  let operators: ClientId[] = [];
  let freeForAll = false;
  let ws: WebSocket | null = null;
  let rejected = false;
  let participants: Participant[] = [];
  let pendingUpdate: { tag: string; href: string } | null = null;

  type PanelInstance = ReturnType<typeof mountPanel>;
  let panel: PanelInstance | null = null;

  function canDrive(): boolean {
    return you === adminId || operators.includes(you);
  }

  const panelHooks = {
    onCopyLink: () => {
      const url = currentRoomUrl();
      copyToClipboard(url).then((ok) =>
        panel?.appendSystem(ok ? "Room link copied." : "Copy failed — link: " + url),
      );
    },
    onShareForNonInstallers: () => {
      const url = wrapperLinkFor(currentRoomUrl(), roomId, passphrase);
      copyToClipboard(url).then((ok) =>
        panel?.appendSystem(
          ok
            ? "Onboarding link copied — friends without the extension will see install steps."
            : "Copy failed — link: " + url,
        ),
      );
    },
    onToggleFFA: (next: boolean) => {
      freeForAll = next;
      send({ type: "ffa", freeForAll: next });
    },
    onBringEveryone: () => {
      // Announce the page we're already on — followers re-join here. Send the
      // bare URL (no hash); each follower re-appends their own room fragment.
      if (!canDrive()) return;
      const bare = location.href.split("#")[0] ?? location.href;
      send({ type: "navigate", from: you, url: bare, title: document.title.slice(0, 200), ts: Date.now() });
      panel?.appendSystem("📍 Brought everyone to this page.");
    },
    onSendChat: (text: string) => {
      const ts = Date.now();
      send({ type: "chat", from: you, name: me, text, ts });
      panel?.appendChat(you, me, text, ts);
    },
    onSubmitUsername: (name: string) => {
      me = name;
      localStorage.setItem("cp-name", name);
      connect();
    },
    onRename: (name: string) => {
      me = name;
      localStorage.setItem("cp-name", name);
      // Optimistic: update local DOM immediately, server broadcast will confirm.
      panel?.applyRename(you, name);
      send({ type: "rename", from: you, name });
    },
    onReact: (emoji: import("../../shared/protocol").ReactionEmoji) => {
      send({ type: "reaction", from: you, name: me, emoji, ts: Date.now() });
    },
    onTyping: () => {
      send({ type: "typing", from: you, name: me, ts: Date.now() });
    },
    onPromote: (target: ClientId) => {
      if (you !== adminId) return;
      send({ type: "promote", target });
    },
    onDemote: (target: ClientId) => {
      if (you !== adminId) return;
      send({ type: "demote", target });
    },
    onSetKey: (key: string | null) => {
      passphrase = key;
      writeRoomFragment(roomId, passphrase);
      panel?.appendSystem(
        key
          ? "🔒 Room key set. Share the new link — friends will need to reconnect with it."
          : "🔓 Room key cleared.",
      );
      // Force a reconnect so the relay re-pins the new passphrase.
      // Empty rooms reset their pin, so close + reconnect gives us a clean state if we were alone.
      if (ws) try { ws.close(); } catch {}
    },
    onReplayOnboarding: () => {
      resetOnboarded();
      launchOnboarding();
    },
    onDeactivate: () => {
      // Persist the off state for this host, tear everything down, hand control
      // back to the activator. Invite-link hashes will override on next nav
      // (see index.ts — auto-activates regardless of stored disabled flag).
      setHostDisabled(true);
      rejected = true;
      panel?.destroy();
      panel = null;
      if (ws) try { ws.close(); } catch {}
      ws = null;
      onDeactivated?.();
    },
  };

  function mountUI() {
    panel = mountPanel(panelHooks, me || undefined);
    if (you) {
      panel.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase, canDrive: canDrive() });
    }
    if (pendingUpdate) panel.showUpdateBanner(pendingUpdate.tag, pendingUpdate.href);
  }

  mountUI();

  function launchOnboarding() {
    if (!panel) return;
    const a = panel.anchors;
    runCoachmark([
      { anchor: a.header, text: "Welcome to Watch-Party. Click the toolbar icon to turn it on for any tab — you're connected now.", placement: "left" },
      { anchor: a.copy, text: "Share this link with friends to watch together. The room ID lives in the URL after #.", placement: "left" },
      { anchor: a.nameForm, text: "Pick a display name to start chatting. You can change it later from the gear menu — old messages update too.", placement: "left" },
      { anchor: a.reactions, text: "Tap to send a floating reaction. Limited to one every 2 seconds.", placement: "left" },
      { anchor: a.layout, text: "Switch the chat between Overlay, Push (reflows the page), and Hidden.", placement: "bottom" },
      { anchor: a.settings, text: "Colors, text size, accessibility (colorblind / high contrast), and tour replay live in settings.", placement: "bottom" },
    ]);
  }

  // Fire onboarding on first open after first connection — wait for `welcome`
  // so the gate is dismissed and the UI is fully populated.
  let onboardingFired = false;
  function maybeOnboard() {
    if (onboardingFired) return;
    if (hasOnboarded()) return;
    onboardingFired = true;
    setTimeout(launchOnboarding, 600);
  }

  const video = makeTopFrameAdapter(() =>
    panel?.appendSystem("▶ Playing muted to stay in sync — click the video to restore sound."),
  );
  const sync = createSyncClient({
    video,
    send: (m) => send(m),
    isAdmin: () => canDrive(),
    freeForAll: () => freeForAll,
  });

  function send(m: WireMsg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }

  function connect() {
    ws = new WebSocket(`${WS_URL}/ws?room=${encodeURIComponent(roomId)}`);
    ws.addEventListener("open", () => {
      const hello: WireMsg = { type: "hello", name: me, pathname: location.pathname, v: 1 };
      if (passphrase) (hello as { passphrase?: string }).passphrase = passphrase;
      send(hello);
    });
    ws.addEventListener("message", (e) => {
      let msg: WireMsg;
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      handle(msg);
    });
    ws.addEventListener("close", () => {
      if (rejected) return;
      panel?.appendSystem("Disconnected. Reconnecting in 2s…");
      setTimeout(connect, 2000);
    });
  }
  if (me) connect();

  checkForUpdate().then((latest) => {
    if (latest && gt(latest, VERSION)) {
      pendingUpdate = { tag: latest, href: RELEASES_URL };
      panel?.showUpdateBanner(latest, RELEASES_URL);
    }
  });

  function handle(msg: WireMsg) {
    switch (msg.type) {
      case "welcome":
        you = msg.you;
        adminId = msg.adminId;
        operators = msg.operators;
        freeForAll = msg.freeForAll;
        participants = msg.participants;
        panel?.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase, canDrive: canDrive() });
        if (canDrive()) {
          sync.startHeartbeat();
          if (you === adminId) panel?.appendSystem("You are the admin. ⭐ to grant playback to others, 👑 stays with you.");
          else panel?.appendSystem("You're an operator — you can drive playback.");
        }
        if (msg.lastState) sync.applyRemote(msg.lastState);
        maybeOnboard();
        return;
      case "participants":
        adminId = msg.adminId;
        operators = msg.operators;
        participants = msg.participants;
        panel?.setState({ you, adminId, freeForAll, participants, roomUrl: currentRoomUrl(), passphrase, canDrive: canDrive() });
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
        panel?.appendSystem(`⚠️ Different content. You: ${msg.yourPath} / Them: ${msg.theirPath}`);
        return;
      case "rejected":
        rejected = true;
        if (ws) try { ws.close(); } catch {}
        panel?.appendSystem(
          msg.reason === "passphrase"
            ? "❌ Wrong room key. Get the full share link from whoever set up the room."
            : "❌ Connection rejected.",
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
      case "navigate":
        if (msg.from === you) return; // never follow our own broadcast
        if (msg.from !== adminId && !operators.includes(msg.from)) return; // defensive; server already gated
        startFollowCountdown(msg.url, msg.title);
        return;
      case "play":
      case "pause":
      case "seek":
      case "state":
        sync.applyRemote(msg);
        return;
    }
  }

  // Auto-follow with a cancelable countdown. The host is already on the target
  // page; we re-append our own room fragment so the new page re-joins the same
  // room (and resyncs from the relay's lastState).
  let followTimer: ReturnType<typeof setInterval> | null = null;
  function startFollowCountdown(url: string, title?: string) {
    if (followTimer) clearInterval(followTimer);
    const target = roomLinkForUrl(url, roomId, passphrase);
    const where = (title && title.trim()) || new URL(url, location.href).host;
    let secs = 5;
    const cancel = () => {
      if (followTimer) clearInterval(followTimer);
      followTimer = null;
      panel?.hideFollowBanner();
      panel?.appendSystem("Stayed here — rejoin anytime from the room link.");
    };
    const render = () => panel?.setFollowBanner(`Host moved to ${where} — following in ${secs}s…`, cancel);
    render();
    followTimer = setInterval(() => {
      secs -= 1;
      if (secs <= 0) {
        if (followTimer) clearInterval(followTimer);
        followTimer = null;
        window.location.href = target;
        return;
      }
      render();
    }, 1000);
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
      if (ws) try { ws.close(); } catch {}
      ws = null;
    },
    copyInviteLink() {
      const url = currentRoomUrl();
      copyToClipboard(url).then((ok) =>
        panel?.appendSystem(ok ? "Room link copied — share it with your friends." : "Copy failed — link: " + url),
      );
    },
  };
}

function makeTopFrameAdapter(onAutoplayMuted?: () => void): VideoAdapter {
  let v: HTMLVideoElement | null = document.querySelector("video");
  let iframe: HTMLIFrameElement | null = null;
  const listeners = new Set<(k: "play" | "pause" | "seek") => void>();
  let lastIframeAt = 0;
  let lastIframePaused = true;

  const mo = new MutationObserver(() => {
    const nv = document.querySelector("video");
    if (nv && nv !== v) {
      v = nv as HTMLVideoElement;
      attach(v);
    }
    const ifr = document.querySelector("iframe");
    if (ifr && ifr !== iframe) iframe = ifr as HTMLIFrameElement;
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  if (v) attach(v);
  iframe = document.querySelector("iframe");

  function attach(el: HTMLVideoElement) {
    const emit = (k: "play" | "pause" | "seek") => listeners.forEach((cb) => cb(k));
    el.addEventListener("play", () => emit("play"));
    el.addEventListener("pause", () => emit("pause"));
    el.addEventListener("seeked", () => emit("seek"));
  }

  window.addEventListener("message", (e: MessageEvent) => {
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

  function postToIframe(payload: object) {
    iframe?.contentWindow?.postMessage({ [IFRAME_TAG]: true, ...payload }, "*");
  }

  setInterval(() => postToIframe({ kind: "queryState" }), 1000);

  return {
    play: () => {
      if (v) playWithAutoplayFallback(v, onAutoplayMuted);
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
    getTime: () => (v ? v.currentTime : lastIframeAt),
    isPaused: () => (v ? v.paused : lastIframePaused),
    onEvent: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

function loadStoredName(): string | null {
  const n = localStorage.getItem("cp-name");
  return n && n.trim() ? n.slice(0, 32) : null;
}

/**
 * Play a <video> while working around the receiver-side autoplay policy. A
 * remote "play" arrives with no user gesture on this tab, so the browser
 * rejects programmatic play() and the viewer silently freezes — out of sync,
 * even though the play *message* arrived (looks like "pause works, play
 * doesn't"). Muted autoplay is always permitted, so on rejection we mute and
 * retry — keeping the video rolling and in sync — then restore sound on the
 * viewer's next interaction anywhere on the page. The driver's own play() comes
 * from a real click, succeeds unmuted, and never hits the fallback.
 */
function playWithAutoplayFallback(v: HTMLVideoElement, onMutedFallback?: () => void) {
  v.play().catch(() => {
    v.muted = true;
    v.play()
      .then(() => {
        onMutedFallback?.();
        const restore = () => {
          v.muted = false;
          document.removeEventListener("pointerdown", restore, true);
        };
        document.addEventListener("pointerdown", restore, true);
      })
      .catch(() => {});
  });
}

/**
 * Copy text to the clipboard, resilient across Firefox + Chrome and the sites
 * we inject into. The async Clipboard API (`navigator.clipboard.writeText`) is
 * blocked on pages that send `Permissions-Policy: clipboard-write=()` (several
 * video hosts do) and is missing outside secure contexts — in those cases the
 * promise rejects and the copy buttons feel dead. Fall back to a hidden
 * <textarea> + `execCommand("copy")`, which is gated on the user gesture rather
 * than the document's permission policy. Must be invoked synchronously from a
 * click handler so transient activation is still live for the fallback.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Blocked by Permissions-Policy / not focused — fall through to legacy path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function ensureRoom(): { roomId: string; passphrase: string | null } {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const existing = h.get("party");
  const key = h.get("key");
  if (existing) {
    return { roomId: existing, passphrase: key && key.length ? key : null };
  }
  // New room: ~128 bits of entropy, base64url, no padding.
  const id = randomToken(16);
  h.set("party", id);
  history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
  return { roomId: id, passphrase: null };
}

function roomLinkForCurrent(id: string, passphrase: string | null): string {
  const frag = passphrase ? `party=${id}&key=${encodeURIComponent(passphrase)}` : `party=${id}`;
  return `${location.origin}${location.pathname}${location.search}#${frag}`;
}

// Build a room link for an arbitrary base URL (used by follow-the-host): strip
// any existing hash and append our room fragment so the destination re-joins.
function roomLinkForUrl(base: string, id: string, passphrase: string | null): string {
  const bare = base.split("#")[0] ?? base;
  const frag = passphrase ? `party=${id}&key=${encodeURIComponent(passphrase)}` : `party=${id}`;
  return `${bare}#${frag}`;
}

function wrapperLinkFor(videoLink: string, id: string, passphrase: string | null): string {
  const bare = videoLink.split("#")[0] ?? videoLink;
  const v = base64urlEncode(bare);
  const parts = [`v=${v}`, `party=${id}`];
  if (passphrase) parts.push(`key=${encodeURIComponent(passphrase)}`);
  return `${LANDING_ORIGIN}/#${parts.join("&")}`;
}

function base64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function writeRoomFragment(id: string, passphrase: string | null) {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  h.set("party", id);
  if (passphrase) h.set("key", passphrase);
  else h.delete("key");
  history.replaceState(null, "", `${location.pathname}${location.search}#${h.toString()}`);
}

function randomToken(byteLen: number): string {
  const buf = new Uint8Array(byteLen);
  (crypto.getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.floor(Math.random() * 256))));
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Bumped cache key on the v0.5→v0.6 upgrade to flush bad cached "v0.4.1"
// entries from the pre-semver check.
const UPDATE_CACHE_KEY = "cp-update-check-v2";

async function checkForUpdate(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(UPDATE_CACHE_KEY);
    if (cached) {
      const { tag, ts } = JSON.parse(cached) as { tag: string; ts: number };
      if (Date.now() - ts < 6 * 60 * 60 * 1000) return tag;
    }
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { tag_name?: string };
    const tag = json.tag_name ?? null;
    if (tag) localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ tag, ts: Date.now() }));
    return tag;
  } catch {
    return null;
  }
}

// Compare semver-ish versions (e.g. "v0.6.0" vs "0.5.0"). Returns true iff a > b.
function gt(a: string, b: string): boolean {
  const parse = (s: string) =>
    s.replace(/^v/, "").split(".").map((n) => {
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
