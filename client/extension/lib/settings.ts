// Typed wrapper around chrome.storage.sync. Falls back to in-memory + localStorage
// when chrome.storage isn't available (userscript build, or extension popup pre-load).

export type Palette = "dusk" | "ember" | "clay" | "espresso" | "moss" | "mustard" | "linen";
export type FontFamily = "mosvita" | "new-astro" | "system";
export type FontSize = "sm" | "md" | "lg";

export interface Settings {
  master_enabled: boolean;
  emoji_picker: boolean;
  sound_enabled: boolean;
  sound_volume: number; // 0..1
  notifications_enabled: boolean;
  font_family: FontFamily;
  font_size: FontSize;
  palette: Palette;
  auto_follow_video: boolean;
  arrow_pulse_seen: boolean;
}

export const DEFAULTS: Settings = {
  master_enabled: true,
  emoji_picker: true,
  sound_enabled: true,
  sound_volume: 0.6,
  notifications_enabled: false,
  font_family: "mosvita",
  font_size: "md",
  palette: "dusk",
  auto_follow_video: true,
  arrow_pulse_seen: false,
};

const STORAGE_KEY = "watchparty_settings_v1";

type AnyChrome = { storage?: { sync?: ChromeStorageArea; local?: ChromeStorageArea; onChanged?: { addListener: (cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void } } };
type ChromeStorageArea = {
  get: (key: string, cb: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, cb?: () => void) => void;
};

function chromeStorage(): ChromeStorageArea | null {
  const c = (globalThis as { chrome?: AnyChrome }).chrome;
  return c?.storage?.sync ?? c?.storage?.local ?? null;
}

function mergeDefaults(stored: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULTS, ...(stored ?? {}) };
}

let cache: Settings = DEFAULTS;
let initialized = false;
const listeners = new Set<(s: Settings) => void>();

function emit() {
  for (const cb of listeners) cb(cache);
}

export async function loadSettings(): Promise<Settings> {
  if (initialized) return cache;
  const api = chromeStorage();
  if (api) {
    cache = await new Promise<Settings>((resolve) => {
      api.get(STORAGE_KEY, (items) => {
        resolve(mergeDefaults(items[STORAGE_KEY] as Partial<Settings> | undefined));
      });
    });
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cache = mergeDefaults(raw ? (JSON.parse(raw) as Partial<Settings>) : null);
    } catch {
      cache = { ...DEFAULTS };
    }
  }
  initialized = true;
  // Subscribe to live changes in extension builds.
  const c = (globalThis as { chrome?: AnyChrome }).chrome;
  c?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    const entry = changes[STORAGE_KEY];
    if (!entry) return;
    cache = mergeDefaults(entry.newValue as Partial<Settings> | undefined);
    emit();
  });
  return cache;
}

export function getSettings(): Settings {
  return cache;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  cache = { ...cache, ...patch };
  const api = chromeStorage();
  if (api) {
    await new Promise<void>((resolve) => api.set({ [STORAGE_KEY]: cache }, () => resolve()));
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {}
  }
  emit();
  return cache;
}

export function onSettingsChange(cb: (s: Settings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Brand tokens — kept here so client/extension/lib/* is self-contained and
// the panel can pull them at runtime without an extra import.
export const PALETTES: Record<Palette, { bg: string; fg: string; accent: string; accentSoft: string; rail: string; bubble: string; }> = {
  dusk:     { bg: "#1A243D", fg: "#F1ECE1", accent: "#D39203", accentSoft: "rgba(211,146,3,0.18)",  rail: "rgba(241,236,225,0.10)", bubble: "rgba(241,236,225,0.06)" },
  ember:    { bg: "#4E0000", fg: "#F1ECE1", accent: "#D39203", accentSoft: "rgba(211,146,3,0.22)",  rail: "rgba(241,236,225,0.14)", bubble: "rgba(241,236,225,0.08)" },
  clay:     { bg: "#A24617", fg: "#F1ECE1", accent: "#F1ECE1", accentSoft: "rgba(241,236,225,0.18)",rail: "rgba(241,236,225,0.16)", bubble: "rgba(241,236,225,0.08)" },
  espresso: { bg: "#241916", fg: "#F1ECE1", accent: "#A24617", accentSoft: "rgba(162,70,23,0.22)",  rail: "rgba(241,236,225,0.10)", bubble: "rgba(241,236,225,0.06)" },
  moss:     { bg: "#797028", fg: "#F1ECE1", accent: "#F1ECE1", accentSoft: "rgba(241,236,225,0.18)",rail: "rgba(241,236,225,0.16)", bubble: "rgba(241,236,225,0.08)" },
  mustard:  { bg: "#D39203", fg: "#241916", accent: "#4E0000", accentSoft: "rgba(78,0,0,0.16)",     rail: "rgba(36,25,22,0.16)",    bubble: "rgba(36,25,22,0.07)" },
  linen:    { bg: "#F1ECE1", fg: "#241916", accent: "#A24617", accentSoft: "rgba(162,70,23,0.14)",  rail: "rgba(36,25,22,0.14)",    bubble: "rgba(36,25,22,0.05)" },
};

export const PALETTE_LABELS: Record<Palette, string> = {
  dusk: "Dusk",
  ember: "Ember",
  clay: "Clay",
  espresso: "Espresso",
  moss: "Moss",
  mustard: "Mustard",
  linen: "Linen",
};

export const FONT_PX: Record<FontSize, number> = { sm: 12.5, md: 13.5, lg: 15 };
