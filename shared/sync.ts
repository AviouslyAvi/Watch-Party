import type { SyncMsg, WireMsg } from "./protocol";

export interface VideoAdapter {
  play(): void;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPaused(): boolean;
  onEvent(cb: (kind: "play" | "pause" | "seek") => void): () => void;
}

export interface SyncClientOpts {
  video: VideoAdapter;
  send: (msg: WireMsg) => void;
  isAdmin: () => boolean;
  freeForAll: () => boolean;
  now?: () => number;
  driftThresholdSec?: number;
  heartbeatMs?: number;
}

const SUPPRESS_MS = 300;

export function createSyncClient(opts: SyncClientOpts) {
  const now = opts.now ?? (() => Date.now());
  const driftThreshold = opts.driftThresholdSec ?? 1.5;
  const heartbeatMs = opts.heartbeatMs ?? 5000;

  let suppressUntil = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const canEmit = () => opts.isAdmin() || opts.freeForAll();

  const offLocal = opts.video.onEvent((kind) => {
    if (now() < suppressUntil) return;
    if (!canEmit()) return;
    opts.send({ type: kind, at: opts.video.getTime(), ts: now() });
  });

  function applyRemote(msg: SyncMsg) {
    suppressUntil = now() + SUPPRESS_MS;
    switch (msg.type) {
      case "play": {
        const drift = Math.abs(opts.video.getTime() - msg.at);
        if (drift > driftThreshold) opts.video.seek(msg.at);
        opts.video.play();
        break;
      }
      case "pause": {
        opts.video.pause();
        const drift = Math.abs(opts.video.getTime() - msg.at);
        if (drift > driftThreshold) opts.video.seek(msg.at);
        break;
      }
      case "seek":
        opts.video.seek(msg.at);
        break;
      case "state": {
        const drift = Math.abs(opts.video.getTime() - msg.at);
        if (drift > driftThreshold) opts.video.seek(msg.at);
        if (msg.paused && !opts.video.isPaused()) opts.video.pause();
        if (!msg.paused && opts.video.isPaused()) opts.video.play();
        break;
      }
    }
  }

  function revert(at: number, paused: boolean) {
    suppressUntil = now() + SUPPRESS_MS;
    opts.video.seek(at);
    if (paused) opts.video.pause();
    else opts.video.play();
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!opts.isAdmin()) return;
      opts.send({
        type: "state",
        at: opts.video.getTime(),
        paused: opts.video.isPaused(),
        ts: now(),
      });
    }, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function dispose() {
    offLocal();
    stopHeartbeat();
  }

  return { applyRemote, revert, startHeartbeat, stopHeartbeat, dispose };
}
