/**
 * Prétraitement d’image pour codes-barres flous / mal éclairés (mobile).
 * N’altère pas le flux vidéo affiché — uniquement le canvas d’analyse.
 */

/** Convertit en niveaux de gris + étirement de contraste (luminosité). */
export function enhanceBarcodeCanvas(
  source: HTMLCanvasElement,
  options?: { invert?: boolean; contrastBoost?: number }
): HTMLCanvasElement {
  const invert = options?.invert === true;
  const boost = options?.contrastBoost ?? 1.35;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!sctx || !octx || source.width < 8 || source.height < 8) return source;

  const img = sctx.getImageData(0, 0, source.width, source.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) | 0;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    let g = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) | 0;
    // Étirement + léger boost
    g = Math.round(((g - min) / span) * 255);
    g = Math.max(0, Math.min(255, Math.round((g - 128) * boost + 128)));
    if (invert) g = 255 - g;
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Agrandit 2× (nearest-neighbor) — aide ZXing sur EAN petits / flous. */
export function upscaleCanvas2x(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, source.width * 2);
  out.height = Math.max(1, source.height * 2);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/**
 * Unsharp mask léger (netteté) — 3×3.
 * kernel: centre 5, voisins -1 → gain netteté sans trop de bruit.
 */
export function sharpenCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  if (w < 3 || h < 3) return source;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) return source;
  const src = sctx.getImageData(0, 0, w, h);
  const dst = sctx.createImageData(w, h);
  const s = src.data;
  const d = dst.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (const c of [0, 1, 2]) {
        const v =
          5 * s[idx(x, y) + c]! -
          s[idx(x - 1, y) + c]! -
          s[idx(x + 1, y) + c]! -
          s[idx(x, y - 1) + c]! -
          s[idx(x, y + 1) + c]!;
        d[idx(x, y) + c] = Math.max(0, Math.min(255, v));
      }
      d[idx(x, y) + 3] = 255;
    }
  }
  // bords : copie
  for (let x = 0; x < w; x++) {
    for (const c of [0, 1, 2, 3]) {
      d[idx(x, 0) + c] = s[idx(x, 0) + c]!;
      d[idx(x, h - 1) + c] = s[idx(x, h - 1) + c]!;
    }
  }
  for (let y = 0; y < h; y++) {
    for (const c of [0, 1, 2, 3]) {
      d[idx(0, y) + c] = s[idx(0, y) + c]!;
      d[idx(w - 1, y) + c] = s[idx(w - 1, y) + c]!;
    }
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return source;
  octx.putImageData(dst, 0, 0);
  return out;
}
