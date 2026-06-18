// Rasterize icon.svg → PNGs at the sizes Chrome and Firefox want.
// Run from repo root: node client/extension/icons/gen-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, "icon.svg"));
const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const out = join(here, `icon-${size}.png`);
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`✓ ${out}`);
}
