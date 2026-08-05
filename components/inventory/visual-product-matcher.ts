/**
 * Reconnaissance visuelle légère côté client (inventaire mobile).
 * Compare une image caméra aux vignettes catalogue déjà connues.
 * Aucune dépendance ML — hash perceptuel 8×8 + distance de Hamming.
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
};

export type VisualMatch = VisualCatalogProduct & {
  score: number;
  distance: number;
};

const HASH_SIZE = 8;

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

  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const samples: number[] = [];
      const x0 = Math.floor(x * cellW);
      const y0 = Math.floor(y * cellH);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * cellW));
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * cellH));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * width + px) * 4;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          samples.push(0.299 * r + 0.587 * g + 0.114 * b);
        }
      }
      grays.push(average(samples));
    }
  }

  const mean = average(grays);
  const out = new Uint8Array(HASH_SIZE); // 8 octets = 64 bits
  for (let i = 0; i < 64; i++) {
    if (grays[i] >= mean) {
      out[i >> 3] |= 1 << (i & 7);
    }
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

async function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function hashFromImage(img: HTMLImageElement): Uint8Array | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = HASH_SIZE * 8;
    canvas.height = HASH_SIZE * 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return perceptualHashFromImageData(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    );
  } catch {
    return null;
  }
}

/** Prépare l’index visuel à partir des produits catalogue (avec imageUrl). */
export async function buildVisualIndex(
  products: VisualCatalogProduct[],
  options?: { maxProducts?: number }
): Promise<VisualIndexedProduct[]> {
  const max = options?.maxProducts ?? 400;
  const withImage = products
    .filter((p) => Boolean(p.imageUrl?.trim()) && Boolean(p.name?.trim()))
    .slice(0, max);

  // Une seule image à hasher par URL (plusieurs produits peuvent partager la même vignette)
  const byUrl = new Map<string, VisualCatalogProduct[]>();
  for (const p of withImage) {
    const url = p.imageUrl.trim();
    const list = byUrl.get(url) || [];
    list.push(p);
    byUrl.set(url, list);
  }

  const indexed: VisualIndexedProduct[] = [];
  const urls = [...byUrl.keys()];

  // Charge par lots pour limiter la pression réseau / mémoire
  const batchSize = 8;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (url) => {
        const img = await loadImageElement(url);
        if (!img) return;
        const hash = hashFromImage(img);
        if (!hash) return;
        for (const p of byUrl.get(url) || []) {
          indexed.push({ ...p, hash });
        }
      })
    );
  }

  return indexed;
}

/**
 * Compare un canvas (frame caméra) à l’index.
 * score = 1 - distance/64
 */
export function matchVisualCanvas(
  canvas: HTMLCanvasElement,
  index: VisualIndexedProduct[],
  options?: { limit?: number; maxDistance?: number }
): VisualMatch[] {
  if (!index.length) return [];
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 16 || canvas.height < 16) return [];

  let hash: Uint8Array;
  try {
    hash = perceptualHashFromImageData(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    );
  } catch {
    return [];
  }

  const maxDistance = options?.maxDistance ?? 14;
  const limit = options?.limit ?? 8;

  const scored = index
    .map((p) => {
      const distance = hammingDistance(hash, p.hash);
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        range: p.range,
        category: p.category,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        priceCents: p.priceCents,
        distance,
        score: 1 - distance / 64,
      };
    })
    .filter((m) => m.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || b.score - a.score);

  // Déduplique par id produit
  const seen = new Set<string>();
  const unique: VisualMatch[] = [];
  for (const m of scored) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    unique.push(m);
    if (unique.length >= limit) break;
  }
  return unique;
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
  const side = Math.floor(Math.min(vw, vh) * 0.78);
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
 * Décide auto-remplissage vs suggestions :
 * - 1 match clairement meilleur → auto
 * - plusieurs proches / même image → suggestions
 */
export function decideVisualAction(matches: VisualMatch[]): {
  mode: "none" | "auto" | "suggest";
  picks: VisualMatch[];
} {
  if (!matches.length) return { mode: "none", picks: [] };
  const best = matches[0];
  // Même vignette partagée par plusieurs produits → jamais d’auto-remplissage
  const sameImage = matches.filter((m) => m.imageUrl === best.imageUrl);
  if (sameImage.length > 1) {
    return { mode: "suggest", picks: sameImage.slice(0, 6) };
  }
  const second = matches[1];
  const clearWinner =
    best.distance <= 7 && (!second || second.distance - best.distance >= 5);
  if (clearWinner) return { mode: "auto", picks: [best] };
  if (matches.length >= 2 && best.distance <= 11) {
    return { mode: "suggest", picks: matches.slice(0, 5) };
  }
  // Auto seul si match très net
  if (best.distance <= 5) return { mode: "auto", picks: [best] };
  if (best.distance <= 10) return { mode: "suggest", picks: matches.slice(0, 4) };
  return { mode: "none", picks: [] };
}
