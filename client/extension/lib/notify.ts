// Audio + push notification helpers. Sound is a generated WAV embedded as a
// data URL by the build (client/extension/_sound.generated.ts). That keeps both
// the extension and the userscript builds working with a single code path.

import { NOTIFY_SOUND_DATA_URL } from "../_sound.generated";
import { getSettings } from "./settings";

let cachedAudio: HTMLAudioElement | null = null;

function audio(): HTMLAudioElement {
  if (!cachedAudio) {
    cachedAudio = new Audio(NOTIFY_SOUND_DATA_URL);
    cachedAudio.preload = "auto";
  }
  return cachedAudio;
}

export function playNotifySound() {
  const s = getSettings();
  if (!s.sound_enabled) return;
  const el = audio();
  try {
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, s.sound_volume));
    void el.play().catch(() => {});
  } catch {}
}

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export function notifyPermission(): NotifyPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifyPermission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    const res = await Notification.requestPermission();
    return res as NotifyPermission;
  } catch {
    return "denied";
  }
}

export function showPush(title: string, body: string) {
  const s = getSettings();
  if (!s.notifications_enabled) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "watch-party-chat", renotify: true } as NotificationOptions);
  } catch {}
}
