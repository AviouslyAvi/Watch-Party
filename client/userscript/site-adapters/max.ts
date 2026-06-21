import { makeStreamingAdapter } from "./index";

// Max (HBO Max) launcher. Playback routes look like max.com/video/watch/<id>
// (and /player/). Controls are an auto-hiding overlay, so these anchors are
// best-effort guesses and this usually lands as the fixed-position fallback
// pill. Selectors are untested — tighten once verified on the live site.
export const maxAdapter = makeStreamingAdapter({
  host: ".max.com",
  idSuffix: "max",
  isWatchPage: () => /^\/(video|player|watch)\b/.test(location.pathname),
  candidates: [
    '[data-testid="player-ux-top-bar"]',
    '[class*="PlayerControls"] [class*="topBar"]',
    '[class*="top-bar"]',
  ],
});
