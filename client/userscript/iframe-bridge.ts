type FromTop =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "seek"; at: number }
  | { kind: "queryState" };

type FromIframe =
  | { kind: "videoEvent"; event: "play" | "pause" | "seek"; at: number; paused: boolean }
  | { kind: "videoState"; at: number; paused: boolean; hasVideo: boolean };

const TAG = "__aviousParty__";

export function runIframeBridge() {
  let video: HTMLVideoElement | null = null;

  function findVideo(): HTMLVideoElement | null {
    return document.querySelector("video");
  }

  function bind(v: HTMLVideoElement) {
    if (video === v) return;
    video = v;
    const post = (event: "play" | "pause" | "seek") => {
      parent.postMessage(
        { [TAG]: true, kind: "videoEvent", event, at: v.currentTime, paused: v.paused } satisfies (FromIframe & { [TAG]: true }),
        "*",
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

  window.addEventListener("message", (e: MessageEvent) => {
    const data = e.data;
    if (!data || typeof data !== "object" || !data[TAG]) return;
    const m = data as FromTop & { [TAG]: true };
    const v = video ?? findVideo();
    if (!v) return;
    switch (m.kind) {
      case "play":
        v.play().catch(() => {});
        return;
      case "pause":
        v.pause();
        return;
      case "seek":
        v.currentTime = m.at;
        return;
      case "queryState":
        parent.postMessage(
          { [TAG]: true, kind: "videoState", at: v.currentTime, paused: v.paused, hasVideo: true } satisfies (FromIframe & { [TAG]: true }),
          "*",
        );
        return;
    }
  });
}

export const IFRAME_TAG = TAG;
export type { FromTop, FromIframe };
