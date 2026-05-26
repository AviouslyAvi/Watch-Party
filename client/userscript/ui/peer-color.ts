import type { ClientId } from "../../../shared/protocol";

export type ColorblindMode = "none" | "deuter" | "protan" | "tritan";

// Wong's 8-color colorblind-safe palette (Bang Wong, Nature Methods 2011).
// Safe across the three common dichromacies — we use the same palette for all
// three modes, the user-visible distinction is just "is colorblind mode on".
const WONG_PALETTE = [
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#009E73", // bluish green
  "#F0E442", // yellow
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#CC79A7", // reddish purple
  "#ffffff", // white-ish (replaces black so it stays visible on dark bg)
];

function fnv1a(id: ClientId): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function colorFor(id: ClientId, mode: ColorblindMode = "none"): string {
  const h = fnv1a(id);
  if (mode === "none") {
    const hue = h % 360;
    return `hsl(${hue}, 70%, 65%)`;
  }
  return WONG_PALETTE[h % WONG_PALETTE.length]!;
}
