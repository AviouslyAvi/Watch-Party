import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

const WS_URL = process.env.WS_URL || "ws://localhost:8787";
const target = process.env.TARGET || "all"; // "user" | "ext" | "all"

mkdirSync("dist", { recursive: true });

async function bundle() {
  const result = await build({
    entryPoints: ["client/userscript/main.ts"],
    bundle: true,
    format: "iife",
    target: "es2020",
    define: { WS_URL: JSON.stringify(WS_URL) },
    write: false,
    legalComments: "none",
  });
  return result.outputFiles[0].text;
}

function buildUserscript(js) {
  const banner = readFileSync("client/userscript/banner.txt", "utf8");
  writeFileSync("dist/avious-party.user.js", banner + "\n" + js);
  console.log(`✓ dist/avious-party.user.js (WS_URL=${WS_URL})`);
}

function buildExtension(js) {
  mkdirSync("dist/extension", { recursive: true });
  writeFileSync("dist/extension/content.js", js);
  copyFileSync("client/extension/manifest.json", "dist/extension/manifest.json");
  console.log(`✓ dist/extension/ (WS_URL=${WS_URL})`);
}

const js = await bundle();
if (target === "user" || target === "all") buildUserscript(js);
if (target === "ext" || target === "all") buildExtension(js);
