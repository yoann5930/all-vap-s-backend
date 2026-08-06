/**
 * Précalcule hash perceptuel + histogramme couleur des images de référence FR.
 * Usage: npx tsx scripts/build-visual-hashes.ts
 * Sortie: data/vape-fr-visual-hashes.json
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

const HASH_SIZE = 8;
const HIST_BINS = 4;
const OUT = join(process.cwd(), "data", "vape-fr-visual-hashes.json");
const SRC = join(process.cwd(), "data", "vape-fr-reference-products.json");
const CACHE_DIR = join(process.cwd(), "data", ".visual-image-cache");

type RefProduct = {
  id: string;
  name: string;
  brand: string;
  range: string | null;
  barcode: string | null;
  imageUrl: string | null;
  source?: string;
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function perceptualHashFromRaw(raw: Buffer, width: number, height: number): number[] {
  const n = width * height;
  const rawGrays = new Array(n);
  let gmin = 255;
  let gmax = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const g = 0.299 * raw[o] + 0.587 * raw[o + 1] + 0.114 * raw[o + 2];
    rawGrays[i] = g;
    if (g < gmin) gmin = g;
    if (g > gmax) gmax = g;
  }
  const span = Math.max(1, gmax - gmin);
  for (let i = 0; i < n; i++) rawGrays[i] = ((rawGrays[i] - gmin) / span) * 255;

  const cellW = width / HASH_SIZE;
  const cellH = height / HASH_SIZE;
  const grays: number[] = [];
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const samples: number[] = [];
      const x0 = Math.floor(x * cellW);
      const y0 = Math.floor(y * cellH);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * cellW));
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * cellH));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          samples.push(rawGrays[py * width + px]);
        }
      }
      grays.push(average(samples));
    }
  }
  const mean = average(grays);
  const out = new Array(HASH_SIZE).fill(0);
  for (let i = 0; i < 64; i++) {
    if (grays[i] >= mean) {
      out[i >> 3] |= 1 << (i & 7);
    }
  }
  return out;
}

function differenceHashFromRaw(raw: Buffer, width: number, height: number): number[] {
  const cols = HASH_SIZE + 1;
  const rows = HASH_SIZE;
  const cellW = width / cols;
  const cellH = height / rows;
  const grid: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const samples: number[] = [];
      const x0 = Math.floor(x * cellW);
      const y0 = Math.floor(y * cellH);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * cellW));
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * cellH));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * width + px) * 3;
          samples.push(0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2]);
        }
      }
      grid.push(average(samples));
    }
  }
  const out = new Array(HASH_SIZE).fill(0);
  let bit = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      if (grid[y * cols + x] > grid[y * cols + x + 1]) {
        out[bit >> 3] |= 1 << (bit & 7);
      }
      bit += 1;
    }
  }
  return out;
}

function colorHistFromRaw(raw: Buffer, width: number, height: number): number[] {
  const hist = new Float32Array(HIST_BINS * HIST_BINS * HIST_BINS);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const ri = Math.min(HIST_BINS - 1, (raw[o] * HIST_BINS) >> 8);
    const gi = Math.min(HIST_BINS - 1, (raw[o + 1] * HIST_BINS) >> 8);
    const bi = Math.min(HIST_BINS - 1, (raw[o + 2] * HIST_BINS) >> 8);
    hist[ri * HIST_BINS * HIST_BINS + gi * HIST_BINS + bi] += 1;
  }
  const out = new Array(hist.length);
  for (let i = 0; i < hist.length; i++) {
    out[i] = Math.min(255, Math.round((hist[i] / n) * 255 * 8));
  }
  return out;
}

async function fetchImage(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "image/*,*/*",
        "User-Agent": "AllVaps-Inventory/1.0 (+visual-hash-build)",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function featuresFromBuffer(buf: Buffer): Promise<{
  hash: number[];
  dHash: number[];
  colorHist: number[];
} | null> {
  try {
    // 1) Image normalisée fond blanc (évite stretch fill qui écrase l’étiquette)
    const { data: rgba, info } = await sharp(buf)
      .rotate()
      .resize(256, 256, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    // 2) BBox contenu non-blanc (flacon / étiquette)
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    let found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        const maxc = Math.max(r, g, b);
        const minc = Math.min(r, g, b);
        const sat = maxc - minc;
        // Garde pixels colorés ou assez sombres (texte / label)
        if (maxc < 242 || sat > 18) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) {
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }
    const bw = Math.max(8, maxX - minX + 1);
    const bh = Math.max(8, maxY - minY + 1);

    // 3) Zone étiquette : bande centrale du flacon (ignore bouchon / pied)
    const lx = minX + Math.floor(bw * 0.12);
    const ly = minY + Math.floor(bh * 0.22);
    const lw = Math.max(8, Math.floor(bw * 0.76));
    const lh = Math.max(8, Math.floor(bh * 0.55));

    const labelBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .extract({
        left: Math.min(lx, w - lw),
        top: Math.min(ly, h - lh),
        width: Math.min(lw, w - lx),
        height: Math.min(lh, h - ly),
      })
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      hash: perceptualHashFromRaw(labelBuf.data, labelBuf.info.width, labelBuf.info.height),
      dHash: differenceHashFromRaw(labelBuf.data, labelBuf.info.width, labelBuf.info.height),
      colorHist: colorHistFromRaw(labelBuf.data, labelBuf.info.width, labelBuf.info.height),
    };
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const raw = await readFile(SRC, "utf8");
  const data = JSON.parse(raw) as { products?: RefProduct[] };
  const products = (data.products || []).filter((p) => p.imageUrl && p.name);
  console.log(`Référence: ${products.length} produits avec image`);

  const outProducts: Array<{
    id: string;
    name: string;
    brand: string;
    range: string | null;
    barcode: string | null;
    imageUrl: string;
    source?: string;
    hash: number[];
    dHash: number[];
    colorHist: number[];
  }> = [];

  let ok = 0;
  let fail = 0;
  const concurrency = 6;
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (p) => {
        const url = (p.imageUrl || "")
          .replace(/home_default/gi, "large_default")
          .replace(/small_default/gi, "large_default")
          .replace(/medium_default/gi, "large_default");
        const cacheKey = p.id.replace(/[^a-zA-Z0-9._-]/g, "_") + ".bin";
        const cachePath = join(CACHE_DIR, cacheKey);
        let buf: Buffer | null = null;
        try {
          buf = await readFile(cachePath);
        } catch {
          buf = await fetchImage(url);
          if (buf) {
            try {
              await writeFile(cachePath, buf);
            } catch {
              /* ignore cache write */
            }
          }
        }
        if (!buf) {
          fail += 1;
          console.warn("FAIL fetch", p.id, url);
          return;
        }
        const feat = await featuresFromBuffer(buf);
        if (!feat) {
          fail += 1;
          console.warn("FAIL hash", p.id);
          return;
        }
        outProducts.push({
          id: p.id,
          name: p.name,
          brand: p.brand,
          range: p.range,
          barcode: p.barcode,
          imageUrl: p.imageUrl!,
          source: p.source,
          hash: feat.hash,
          dHash: feat.dHash,
          colorHist: feat.colorHist,
        });
        ok += 1;
      })
    );
    process.stdout.write(`\r  ${Math.min(i + concurrency, products.length)}/${products.length} (ok=${ok} fail=${fail})`);
  }
  console.log("");

  const payload = {
    version: 4,
    generatedAt: new Date().toISOString(),
    total: outProducts.length,
    withHash: outProducts.length,
    note: "label-focused hashes (v4)",
    products: outProducts,
  };
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`Écrit ${OUT} — ${outProducts.length} hash`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
