/**
 * Reconnaissance visuelle légère côté client (inventaire mobile).
 * Compare une image caméra aux vignettes catalogue / référence fabricants.
 * Hash perceptuel 8×8 + histogramme couleur.
 */

export type VisualCatalogProduct = {
  id: string;
  name: string;
  brand?: string | null;
  range?: string | null;
  category?: string | null;
  barcode?: string | null;
  imageUrl: string;
  priceCents?: number | null;
};

export type VisualIndexedProduct = VisualCatalogProduct & {
  hash: Uint8Array;
  /** Histogramme RGB 4×4×4 = 64 bins, normalisé 0–255 */
  colorHist: Uint8Array;
  /** Difference hash optionnel (plus robuste au cadrage) */
  dHash?: Uint8Array;
};

export type VisualMatch = VisualCatalogProduct & {
  score: number;
  distance: number;
};

const HASH_SIZE = 8;
const HIST_BINS = 4; // 4^3 = 64

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Hash perceptuel 8×8 (64 bits) depuis ImageData. */
export function perceptualHashFromImageData(data: ImageData): Uint8Array {
  const { width, height, data: pixels } = data;
  const cellW = width / HASH_SIZE;
  const cellH = height / HASH_SIZE;
  const grays: number[] = [];

  // Normalisation luminance (flash / ombre téléphone)
  let gmin = 255;
  let gmax = 0;
  const rawGrays: number[] = new Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const g = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
    rawGrays[i] = g;
    if (g < gmin) gmin = g;
    if (g > gmax) gmax = g;
  }
  const span = Math.max(1, gmax - gmin);
  for (let i = 0; i < rawGrays.length; i++) {
    rawGrays[i] = ((rawGrays[i] - gmin) / span) * 255;
  }

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
  const out = new Uint8Array(HASH_SIZE);
  for (let i = 0; i < 64; i++) {
    if (grays[i] >= mean) {
      out[i >> 3] |= 1 << (i & 7);
    }
  }
  return out;
}

/** Difference hash 8×8 — plus robuste au cadrage légèrement décalé. */
export function differenceHashFromImageData(data: ImageData): Uint8Array {
  const { width, height, data: pixels } = data;
  // 9×8 grays then compare horizontally → 8×8 bits
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
          const i = (py * width + px) * 4;
          samples.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
        }
      }
      grid.push(average(samples));
    }
  }
  const out = new Uint8Array(HASH_SIZE);
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

/** Histogramme couleur compact (64 bins). */
export function colorHistFromImageData(data: ImageData): Uint8Array {
  const hist = new Float32Array(HIST_BINS * HIST_BINS * HIST_BINS);
  const { data: pixels, width, height } = data;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const ri = Math.min(HIST_BINS - 1, (pixels[o] * HIST_BINS) >> 8);
    const gi = Math.min(HIST_BINS - 1, (pixels[o + 1] * HIST_BINS) >> 8);
    const bi = Math.min(HIST_BINS - 1, (pixels[o + 2] * HIST_BINS) >> 8);
    hist[ri * HIST_BINS * HIST_BINS + gi * HIST_BINS + bi] += 1;
  }
  const out = new Uint8Array(hist.length);
  for (let i = 0; i < hist.length; i++) {
    out[i] = Math.min(255, Math.round((hist[i] / n) * 255 * 8));
  }
  return out;
}

export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < n; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** Distance L1 normalisée 0–1 entre histogrammes. */
export function colorHistDistance(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (n * 255);
}

function loadFromSrc(src: string, crossOrigin: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function featuresFromImage(img: HTMLImageElement): {
  hash: Uint8Array;
  colorHist: Uint8Array;
  dHash: Uint8Array;
} | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64);
    return {
      hash: perceptualHashFromImageData(data),
      colorHist: colorHistFromImageData(data),
      dHash: differenceHashFromImageData(data),
    };
  } catch {
    return null;
  }
}

/**
 * Charge + hashe une image.
 * IMPORTANT : /api/inventaire/image-proxy exige les cookies inventaire
 * → fetch credentials + blob. On hashe AVANT revokeObjectURL (sinon WebView Android = hash vide).
 */
async function loadImageFeatures(url: string): Promise<{
  hash: Uint8Array;
  colorHist: Uint8Array;
  dHash: Uint8Array;
} | null> {
  const sameOrigin =
    url.startsWith("/") ||
    (typeof window !== "undefined" && url.startsWith(window.location.origin));

  let img: HTMLImageElement | null = null;
  let objUrl: string | null = null;

  try {
    if (sameOrigin) {
      const res = await fetch(url, {
        credentials: "include",
        cache: "force-cache",
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size < 80) return null;
      // Certains proxies renvoient octet-stream
      objUrl = URL.createObjectURL(blob);
      img = await loadFromSrc(objUrl, false);
    } else {
      img = await loadFromSrc(url, true);
    }
    if (!img) return null;
    return featuresFromImage(img);
  } catch {
    return null;
  } finally {
    if (objUrl) URL.revokeObjectURL(objUrl);
  }
}

function featuresFromCanvas(canvas: HTMLCanvasElement): {
  hash: Uint8Array;
  colorHist: Uint8Array;
  dHash: Uint8Array;
} | null {
  try {
    const tmp = document.createElement("canvas");
    tmp.width = 64;
    tmp.height = 64;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64);
    return {
      hash: perceptualHashFromImageData(data),
      colorHist: colorHistFromImageData(data),
      dHash: differenceHashFromImageData(data),
    };
  } catch {
    return null;
  }
}

/** Variantes de crop/contraste — photo téléphone vs vignette studio. */
function featureVariantsFromCanvas(canvas: HTMLCanvasElement): Array<{
  hash: Uint8Array;
  colorHist: Uint8Array;
  dHash: Uint8Array;
}> {
  const out: Array<{ hash: Uint8Array; colorHist: Uint8Array; dHash: Uint8Array }> = [];
  const full = featuresFromCanvas(canvas);
  if (full) out.push(full);

  try {
    const w = canvas.width;
    const h = canvas.height;
    const side = Math.floor(Math.min(w, h) * 0.62);
    const sx = Math.floor((w - side) / 2);
    const sy = Math.floor((h - side) / 2);
    const tmp = document.createElement("canvas");
    tmp.width = 64;
    tmp.height = 64;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, sx, sy, side, side, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64);
      out.push({
        hash: perceptualHashFromImageData(data),
        colorHist: colorHistFromImageData(data),
        dHash: differenceHashFromImageData(data),
      });

      const boosted = ctx.getImageData(0, 0, 64, 64);
      const px = boosted.data;
      for (let i = 0; i < px.length; i += 4) {
        px[i] = Math.min(255, Math.max(0, (px[i] - 128) * 1.25 + 128));
        px[i + 1] = Math.min(255, Math.max(0, (px[i + 1] - 128) * 1.25 + 128));
        px[i + 2] = Math.min(255, Math.max(0, (px[i + 2] - 128) * 1.25 + 128));
      }
      out.push({
        hash: perceptualHashFromImageData(boosted),
        colorHist: colorHistFromImageData(boosted),
        dHash: differenceHashFromImageData(boosted),
      });
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Prépare l’index visuel à partir des produits catalogue (avec imageUrl). */
export async function buildVisualIndex(
  products: VisualCatalogProduct[],
  options?: { maxProducts?: number; onProgress?: (done: number, total: number) => void }
): Promise<VisualIndexedProduct[]> {
  const max = options?.maxProducts ?? 700;
  const withImage = products
    .filter((p) => Boolean(p.imageUrl?.trim()) && Boolean(p.name?.trim()))
    .slice(0, max);

  const byUrl = new Map<string, VisualCatalogProduct[]>();
  for (const p of withImage) {
    const url = p.imageUrl.trim();
    const list = byUrl.get(url) || [];
    list.push(p);
    byUrl.set(url, list);
  }

  const indexed: VisualIndexedProduct[] = [];
  const urls = [...byUrl.keys()];
  let done = 0;

  const batchSize = 6;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (url) => {
        const feat = await loadImageFeatures(url);
        done += 1;
        options?.onProgress?.(done, urls.length);
        if (!feat) return;
        for (const p of byUrl.get(url) || []) {
          indexed.push({
            ...p,
            hash: feat.hash,
            colorHist: feat.colorHist,
            dHash: feat.dHash,
          });
        }
      })
    );
  }

  return indexed;
}

/**
 * Compare un canvas (frame caméra) à l’index.
 * Essaie plusieurs crops/contrastes ; garde le meilleur score par produit.
 */
export function matchVisualCanvas(
  canvas: HTMLCanvasElement,
  index: VisualIndexedProduct[],
  options?: { limit?: number; maxDistance?: number }
): VisualMatch[] {
  if (!index.length) return [];
  if (canvas.width < 16 || canvas.height < 16) return [];

  const variants = featureVariantsFromCanvas(canvas);
  if (!variants.length) return [];

  const maxDistance = options?.maxDistance ?? 28;
  const limit = options?.limit ?? 8;
  const bestById = new Map<string, VisualMatch>();

  for (const feat of variants) {
    for (const p of index) {
      const aDist = hammingDistance(feat.hash, p.hash);
      const dDist = p.dHash
        ? hammingDistance(feat.dHash, p.dHash)
        : aDist;
      // Moyenne aHash/dHash (min était trop permissif → faux positifs)
      const distance = Math.round((aDist + dDist) / 2);
      const colorDist = colorHistDistance(feat.colorHist, p.colorHist);
      const hashScore = 1 - distance / 64;
      const colorScore = 1 - colorDist;
      // Hash prioritaire (flacons même marque trop proches en couleur)
      const score = hashScore * 0.75 + colorScore * 0.25;
      if (distance > maxDistance && score < 0.42) continue;
      const prev = bestById.get(p.id);
      if (
        prev &&
        (prev.distance < distance ||
          (prev.distance === distance && prev.score >= score))
      ) {
        continue;
      }
      bestById.set(p.id, {
        id: p.id,
        name: p.name,
        brand: p.brand,
        range: p.range,
        category: p.category,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        priceCents: p.priceCents,
        distance,
        score,
      });
    }
  }

  return [...bestById.values()]
    .sort((a, b) => a.distance - b.distance || b.score - a.score)
    .slice(0, limit);
}

/** Crop central « produit » (carré) depuis une vidéo, pour reconnaissance visuelle. */
export function drawProductCropToCanvas(
  video: HTMLVideoElement,
  target: HTMLCanvasElement,
  size = 384
): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw < 40 || vh < 40) return false;
  // Cadre un peu plus large pour ne pas couper le flacon
  const side = Math.floor(Math.min(vw, vh) * 0.88);
  const sx = Math.floor((vw - side) / 2);
  const sy = Math.floor((vh - side) / 2);
  target.width = size;
  target.height = size;
  const ctx = target.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  return true;
}

/** Remonte les vignettes Prestashop floues (home_default) vers large_default. */
export function sharpenCatalogImageUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/\/\d+-home_default\//i, (m) => m.replace("home_default", "large_default"))
    .replace(/-home_default\./i, "-large_default.")
    .replace(/\/\d+-small_default\//i, (m) => m.replace("small_default", "large_default"))
    .replace(/-small_default\./i, "-large_default.")
    .replace(/\/\d+-medium_default\./i, (m) => m.replace("medium_default", "large_default"))
    .replace(/-medium_default\./i, "-large_default.");
}

/**
 * Décide auto-remplissage vs suggestions.
 * Seuils assouplis pour photo téléphone vs vignette fabricant.
 */
export function decideVisualAction(matches: VisualMatch[]): {
  mode: "none" | "auto" | "suggest";
  picks: VisualMatch[];
} {
  if (!matches.length) return { mode: "none", picks: [] };
  const best = matches[0];
  const sameImage = matches.filter((m) => m.imageUrl === best.imageUrl);
  if (sameImage.length > 1 && best.score < 0.78) {
    return { mode: "suggest", picks: sameImage.slice(0, 6) };
  }
  const second = matches[1];
  const gap = second ? best.score - second.score : best.score;
  const distGap = second ? second.distance - best.distance : 64;

  // Si le 2ᵉ est aussi proche → toujours suggestions (flacons similaires)
  if (second && second.distance - best.distance <= 3) {
    return { mode: "suggest", picks: matches.slice(0, 6) };
  }

  // Auto UNIQUEMENT si clairement meilleur (évite mauvais flacon même marque)
  if (best.distance <= 6 && gap >= 0.05 && distGap >= 4) {
    return { mode: "auto", picks: [best] };
  }
  if (best.score >= 0.85 && best.distance <= 8 && gap >= 0.08) {
    return { mode: "auto", picks: [best] };
  }
  if (best.distance <= 3 && (!second || second.distance >= 8)) {
    return { mode: "auto", picks: [best] };
  }
  // Ambigu → suggestions (souvent plusieurs arômes même forme de flacon)
  if (best.score >= 0.4 || best.distance <= 28) {
    return { mode: "suggest", picks: matches.slice(0, 6) };
  }
  if (best.distance <= 36 || best.score >= 0.35) {
    return { mode: "suggest", picks: matches.slice(0, 4) };
  }
  return { mode: "none", picks: [] };
}
