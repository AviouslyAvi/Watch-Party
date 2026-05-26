import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

const WS_URL = process.env.WS_URL || "ws://localhost:8787";
const target = process.env.TARGET || "all"; // "user" | "ext" | "all"
const manifest = JSON.parse(readFileSync("client/extension/manifest.json", "utf8"));
const VERSION = manifest.version;
const RELEASES_API = process.env.RELEASES_API || "https://api.github.com/repos/AviouslyAvi/Watch-Party/releases/latest";
const RELEASES_URL = process.env.RELEASES_URL || "https://github.com/AviouslyAvi/Watch-Party/releases/latest";

mkdirSync("dist", { recursive: true });

const defines = {
  WS_URL: JSON.stringify(WS_URL),
  VERSION: JSON.stringify(VERSION),
  RELEASES_API: JSON.stringify(RELEASES_API),
  RELEASES_URL: JSON.stringify(RELEASES_URL),
};

async function bundleFile(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "iife",
    target: "es2020",
    define: defines,
    write: false,
    legalComments: "none",
  });
  return result.outputFiles[0].text;
}

async function buildUserscript() {
  const js = await bundleFile("client/userscript/index.ts");
  const banner = readFileSync("client/userscript/banner.txt", "utf8");
  writeFileSync("dist/avious-party.user.js", banner + "\n" + js);
  console.log(`✓ dist/avious-party.user.js (WS_URL=${WS_URL})`);
}

async function buildExtension() {
  mkdirSync("dist/extension", { recursive: true });
  const content = await bundleFile("client/extension/content.ts");
  const background = await bundleFile("client/extension/background.ts");
  writeFileSync("dist/extension/content.js", content);
  writeFileSync("dist/extension/background.js", background);
  copyFileSync("client/extension/manifest.json", "dist/extension/manifest.json");
  console.log(`✓ dist/extension/ (WS_URL=${WS_URL})`);
}

if (target === "user" || target === "all") await buildUserscript();
if (target === "ext" || target === "all") await buildExtension();
