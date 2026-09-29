// One-off: regenerate PWA icons from the crest source whenever docs/brand/crest.png changes.
// Run with: node scripts/generate-icons.mjs
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "docs/brand/crest.png";
const OUT = "public/icons";
// Warm off-white light-theme background (see src/app/layout.tsx's viewport.themeColor).
const BG = "#f5f4f0";

await mkdir(OUT, { recursive: true });

async function plainIcon(size, filename) {
  await sharp(SRC).resize(size, size).png().toFile(`${OUT}/${filename}`);
}

// Maskable icons get masked to a circle/rounded-square by the OS, so the crest is padded
// well inside the safe zone (roughly the centre 70%) rather than filling the canvas.
async function maskableIcon(size, filename) {
  const crestSize = Math.round(size * 0.7);
  const crest = await sharp(SRC).resize(crestSize, crestSize).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: crest, gravity: "center" }])
    .png()
    .toFile(`${OUT}/${filename}`);
}

await plainIcon(192, "icon-192.png");
await plainIcon(512, "icon-512.png");
await maskableIcon(512, "icon-512-maskable.png");
await plainIcon(180, "apple-touch-icon.png");

console.log("Icons written to public/icons/");
