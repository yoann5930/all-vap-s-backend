/**
 * Restaure les fruit-props depuis backup puis défange UNIQUEMENT les bords blancs
 * (sans rembg — les props sont déjà sur fond noir).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DIR = path.resolve("public/media/products/_fruit-props");
const BACKUP = path.join(DIR, "_backup");

async function edgeDefringeOnly(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = Buffer.from(data);
  const idx = (x: number, y: number) => (y * w + x) * 4;

  for (let pass = 0; pass < 3; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y);
        const a = px[i + 3];
        if (a < 10) continue;

        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        let nearClear = 0;
        let nearBlack = 0;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, 1],
        ]) {
          const j = idx(x + dx, y + dy);
          const ja = px[j + 3];
          const jl = 0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2];
          if (ja < 20) nearClear += 1;
          else if (jl < 25) nearBlack += 1;
        }

        const onEdge = nearClear + nearBlack >= 1;
        if (!onEdge) continue;

        // Frange blanche / gris clair uniquement
        if (lum > 170 && sat < 45) {
          px[i + 3] = 0;
        } else if (lum > 140 && sat < 35 && nearClear + nearBlack >= 2) {
          px[i + 3] = 0;
        } else if (nearClear >= 1 && lum > 120 && sat < 55) {
          // Assombrit la frange colorée claire vers le noir
          px[i] = Math.round(r * 0.35);
          px[i + 1] = Math.round(g * 0.35);
          px[i + 2] = Math.round(b * 0.35);
          px[i + 3] = Math.min(a, 180);
        }
      }
    }
  }

  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92 }).toBuffer();
}

async function main() {
  if (!fs.existsSync(BACKUP)) throw new Error("Backup fruit-props manquant");
  const files = fs.readdirSync(BACKUP).filter((f) => /\.webp$/i.test(f));
  for (const f of files) {
    const raw = fs.readFileSync(path.join(BACKUP, f));
    const out = await edgeDefringeOnly(raw);
    fs.writeFileSync(path.join(DIR, f), out);
    console.log("restored+defringed", f);
  }
  console.log(JSON.stringify({ ok: files.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
