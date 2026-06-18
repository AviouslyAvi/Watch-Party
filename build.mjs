import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

const WS_URL = process.env.WS_URL || "ws://localhost:8787";
const target = process.env.TARGET || "all"; // "user" | "ext" | "firefox" | "all"
const manifest = JSON.parse(readFileSync("client/extension/manifest.json", "utf8"));
const VERSION = manifest.version;
const ICON_SIZES = [16, 32, 48, 128];
const RELEASES_API = process.env.RELEASES_API || "https://api.github.com/repos/AviouslyAvi/Watch-Party/releases/latest";
const RELEASES_URL = process.env.RELEASES_URL || "https://github.com/AviouslyAvi/Watch-Party/releases/latest";

mkdirSync("dist", { recursive: true });

const defines = {
  WS_URL: JSON.stringify(WS_URL),
  VERSION: JSON.stringify(VERSION),
  RELEASES_API: JSON.stringify(RELEASES_API),
  RELEASES_URL: JSON.stringify(RELEASES_URL),
};

async function bundleFile(entryPoint, banner) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "iife",
    target: "es2020",
    define: defines,
    write: false,
    legalComments: "none",
    ...(banner ? { banner: { js: banner } } : {}),
  });
  return result.outputFiles[0].text;
}

function copyIcons(destDir) {
  mkdirSync(`${destDir}/icons`, { recursive: true });
  for (const s of ICON_SIZES) {
    copyFileSync(`client/extension/icons/icon-${s}.png`, `${destDir}/icons/icon-${s}.png`);
  }
}

async function buildUserscript() {
  const js = await bundleFile("client/userscript/index.ts");
  const banner = readFileSync("client/userscript/banner.txt", "utf8");
  writeFileSync("dist/avious-party.user.js", banner + "\n" + js);
  console.log(`✓ dist/avious-party.user.js (WS_URL=${WS_URL})`);
}

async function buildExtension() {
  const dir = "dist/extension";
  mkdirSync(dir, { recursive: true });
  const content = await bundleFile("client/extension/content.ts");
  const background = await bundleFile("client/extension/background.ts");
  writeFileSync(`${dir}/content.js`, content);
  writeFileSync(`${dir}/background.js`, background);
  copyFileSync("client/extension/manifest.json", `${dir}/manifest.json`);
  copyIcons(dir);
  console.log(`✓ ${dir}/ (Chrome, WS_URL=${WS_URL})`);
}

// Firefox/Zen (Gecko) MV3 build. Two deltas from the Chrome manifest:
//  - background uses an event-page `scripts` array, not a `service_worker`
//    (Gecko MV3 has no service-worker background).
//  - `browser_specific_settings.gecko` supplies the add-on id + min version
//    (storage.session lands in Firefox 115).
// Source is identical: a one-line banner aliases the callback-style `chrome`
// global to Gecko's promise-based `browser`, which is what the `await`s expect.
const FF_SHIM = "var chrome=globalThis.browser||globalThis.chrome;";

function firefoxManifest() {
  const m = JSON.parse(JSON.stringify(manifest));
  m.background = { scripts: ["background.js"] };
  m.browser_specific_settings = {
    gecko: { id: "watch-party@avious.party", strict_min_version: "115.0" },
  };
  return m;
}

async function buildFirefox() {
  const dir = "dist/extension-firefox";
  mkdirSync(dir, { recursive: true });
  const content = await bundleFile("client/extension/content.ts", FF_SHIM);
  const background = await bundleFile("client/extension/background.ts", FF_SHIM);
  writeFileSync(`${dir}/content.js`, content);
  writeFileSync(`${dir}/background.js`, background);
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(firefoxManifest(), null, 2) + "\n");
  copyIcons(dir);
  console.log(`✓ ${dir}/ (Firefox/Zen, WS_URL=${WS_URL})`);
}

if (target === "user" || target === "all") await buildUserscript();
if (target === "ext" || target === "all") await buildExtension();
if (target === "firefox" || target === "all") await buildFirefox();
