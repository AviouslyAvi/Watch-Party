import { makeStreamingAdapter } from "./index";

// Cineby launcher button. Cineby's DOM isn't public-documented and the player is
// iframe-embedded (CSP-locked), so we anchor to the Cineby chrome itself rather
// than the player. Best-effort: try a few likely header / nav anchors; if none
// hit, the shared factory falls back to a fixed-position pill in the top-right.
// Watch routes typically look like /movie/<id>, /tv/<id>/season/<n>/episode/<n>,
// /watch/<id>. (Precise selectors are deferred pending a DOM dump of the header.)
export const cinebyAdapter = makeStreamingAdapter({
  host: "cineby.app",
  idSuffix: "cineby",
  isWatchPage: () => /^\/(movie|tv|show|watch|play|episode)\b/i.test(location.pathname),
  candidates: [
    "header nav",
    "header [class*='right']",
    "header [class*='actions']",
    "header [class*='controls']",
    "[class*='top-bar'] [class*='actions']",
    "[class*='player-header']",
    "[class*='video-info'] [class*='actions']",
    "header",
  ],
});
