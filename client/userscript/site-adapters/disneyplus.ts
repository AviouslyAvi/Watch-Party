import { makeStreamingAdapter } from "./index";

// Disney+ launcher. Playback routes are disneyplus.com/play/<id> (and /video/).
// Like Netflix the controls are an auto-hiding overlay, so these anchors are
// best-effort guesses and this usually lands as the fixed-position fallback
// pill. Selectors are untested — tighten once verified on the live site.
export const disneyplusAdapter = makeStreamingAdapter({
  host: ".disneyplus.com",
  idSuffix: "disneyplus",
  isWatchPage: () => /^\/(play|video)\b/.test(location.pathname),
  candidates: [
    '[data-testid="player-controls"]',
    ".controls__top",
    ".overlay_controls__top",
  ],
});
