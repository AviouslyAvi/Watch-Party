import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const WS_URL = process.env.WS_URL || "ws://localhost:8787";
const banner = readFileSync("client/userscript/banner.txt", "utf8");

mkdirSync("dist", { recursive: true });

const result = await build({
  entryPoints: ["client/userscript/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  define: { WS_URL: JSON.stringify(WS_URL) },
  write: false,
  legalComments: "none",
});

const js = result.outputFiles[0].text;
writeFileSync("dist/cineby-party.user.js", banner + "\n" + js);
console.log(`✓ dist/cineby-party.user.js (WS_URL=${WS_URL})`);
