import { makeStreamingAdapter } from "./index";

// Netflix launcher. Watch pages are netflix.com/watch/<id>. The player chrome is
// overlaid on the video and churns on hover, so the header anchors below are
// best-effort guesses — in practice this usually lands as the fixed-position
// fallback pill. Selectors are untested and worth tightening once verified on
// the live site.
export const netflixAdapter = makeStreamingAdapter({
  host: ".netflix.com",
  idSuffix: "netflix",
  isWatchPage: () => location.pathname.startsWith("/watch"),
  candidates: [
    '[data-uia="top-buttons"]',
    '[data-uia="player-controls"]',
    ".watch-video--bottom-controls-container",
    ".PlayerControlsNeo__button-control-row",
  ],
});
