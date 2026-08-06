/**
 * Nettoie les props fruits (_fruit-props) : auréoles blanches → transparent.
 * Backup dans _fruit-props/_backup puis réécrit les webp.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { spawnSync } from "node:child_process";

const DIR = path.resolve("public/media/products/_fruit-props");
const BACKUP = path.join(DIR, "_backup");

function rembg(buf: Buffer): Buffer | null {
  const tmpIn = path.join(DIR, `.clean-in-${process.pid}.bin`);
  const tmpOut = path.join(DIR, `.clean-out-${process.pid}.png`);
  try {
    fs.writeFileSync(tmpIn, buf);
    const script = `
from rembg import remove
from pathlib import Path
inp = Path(r"${tmpIn.replace(/\\/g, "/")}")
out = Path(r"${tmpOut.replace(/\\/g, "/")}")
out.write_bytes(remove(inp.read_bytes()))
print("ok")
`;
    const r = spawnSync("python", ["-c", script], {
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 40 * 1024 * 1024,
    });
    if (r.status !== 0 || !fs.existsSync(tmpOut)) return null;
    return fs.readFileSync(tmpOut);
  } catch {
    return null;
  } finally {
    for (const p of [tmpIn, tmpOut]) if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function defringe(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = Buffer.from(data);
  const idx = (x: number, y: number) => (y * w + x) * 4;

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y);
        const a = px[i + 3];
        if (a < 8) continue;
        let nearClear = 0;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          if (px[idx(x + dx, y + dy) + 3] < 24) nearClear += 1;
        }
        if (nearClear === 0) continue;
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum > 150 && sat < 60) {
          px[i + 3] = 0;
        } else if (nearClear >= 2) {
          px[i] = Math.round(r * 0.45);
          px[i + 1] = Math.round(g * 0.45);
          px[i + 2] = Math.round(b * 0.45);
          px[i + 3] = Math.min(a, Math.round(a * 0.65));
        }
      }
    }
  }

  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function main() {
  fs.mkdirSync(BACKUP, { recursive: true });
  const files = fs.readdirSync(DIR).filter((f) => /\.webp$/i.test(f));
  let ok = 0;
  for (const f of files) {
    const src = path.join(DIR, f);
    const bak = path.join(BACKUP, f);
    if (!fs.existsSync(bak)) fs.copyFileSync(src, bak);
    const raw = fs.readFileSync(bak);
    let cut = rembg(raw);
    if (!cut) {
      // fallback : soft white + defringe
      const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const px = Buffer.from(data);
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum > 230 && sat < 30) px[i + 3] = 0;
      }
      cut = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png()
        .toBuffer();
    }
    cut = await defringe(cut);
    cut = await defringe(cut);
    await sharp(cut).webp({ quality: 92, effort: 5 }).toFile(src);
    ok += 1;
    console.log("cleaned", f);
  }
  console.log(JSON.stringify({ ok, total: files.length, backup: BACKUP }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
