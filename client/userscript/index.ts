import { runIframeBridge } from "./iframe-bridge";
import { bootTopFrame } from "./main";

if (window !== window.top) {
  runIframeBridge();
} else {
  if (location.hostname === "watch-party.pages.dev") {
    document.documentElement.dataset.watchPartyInstalled = "1";
  }
  bootTopFrame();
}
