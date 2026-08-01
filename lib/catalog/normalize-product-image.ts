/**
 * Style packshot All Vap's (référence e-tasty) — OBLIGATOIRE à chaque ajout/maj image.
 * Fond noir + fruits saveur derrière + cercle éclairé + bouteille.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const ROOT = process.cwd();
export const PRODUCT_MEDIA_ROOT = path.join(ROOT, "public", "media", "products");
const BACKUP_ROOT = path.join(PRODUCT_MEDIA_ROOT, "_backup_pre_normalize");
const FRUIT_DIR = path.join(PRODUCT_MEDIA_ROOT, "_fruit-props");
const SIZE = 1600;
const PRODUCT_MAX = Math.round(SIZE * 0.62);

const FLAVOR_FRUIT_KEYS: Array<{ re: RegExp; keys: string[] }> = [
  { re: /fruit[-_ ]?du[-_ ]?dragon|pitaya|dragon/i, keys: ["fruit-du-dragon", "ananas"] },
  { re: /citron[-_ ]?vert|lime/i, keys: ["citron-vert", "menthe"] },
  { re: /fruits?[-_ ]?rouges|mixed[-_ ]?red|mix[-_ ]?fruits|extra[-_ ]?fruits/i, keys: ["fraise", "framboise", "myrtille"] },
  { re: /ananas|pineapple/i, keys: ["ananas"] },
  { re: /kiwi/i, keys: ["kiwi", "ananas"] },
  { re: /fraise|strawberry/i, keys: ["fraise"] },
  { re: /framboise|raspberry/i, keys: ["framboise"] },
  { re: /myrtille|blueberry|bleue/i, keys: ["myrtille"] },
  { re: /cassis|blackcurrant/i, keys: ["cassis"] },
  { re: /mure|blackberry/i, keys: ["mure"] },
  { re: /cerise|cherry/i, keys: ["cerise"] },
  { re: /peche|p[eé]che|peach/i, keys: ["peche"] },
  { re: /pasteque|past[eè]que|watermelon/i, keys: ["pasteque"] },
  { re: /mangue|mango/i, keys: ["mangue"] },
  { re: /passion/i, keys: ["passion", "mangue"] },
  { re: /citron|lemon/i, keys: ["citron"] },
  { re: /orange|sanguine/i, keys: ["orange"] },
  { re: /banane|banana/i, keys: ["banane"] },
  { re: /raisin|grape/i, keys: ["raisin"] },
  { re: /grenade|pomegranate/i, keys: ["grenade"] },
  { re: /pomme|apple/i, keys: ["pomme"] },
  { re: /cola/i, keys: ["cerise", "citron"] },
  { re: /menthe|mint|chlorophylle/i, keys: ["menthe"] },
  { re: /vanille|vanilla|dore/i, keys: ["vanille", "custard"] },
  { re: /caramel/i, keys: ["caramel"] },
  { re: /cafe|caf[eé]|coffee|espresso|stout/i, keys: ["cafe"] },
  { re: /cookie/i, keys: ["cookie", "choco"] },
  { re: /choco|chocolat|chocostar/i, keys: ["choco", "cookie"] },
  { re: /noisette|hazelnut/i, keys: ["noisette"] },
  { re: /pecan|p[eé]can/i, keys: ["pecan", "vanille"] },
  { re: /custard|creme|cr[eè]me/i, keys: ["custard", "vanille"] },
  { re: /cereal|c[eé]r[eé]ales|bowl/i, keys: ["cereales", "noisette"] },
  { re: /popcorn|flambeur/i, keys: ["popcorn", "vanille"] },
  { re: /barbe[-_ ]?a[-_ ]?papa|cotton|carnival|violette|bonbon/i, keys: ["barbe-a-papa"] },
  { re: /tabac|virginia|harrison|united/i, keys: ["tabac"] },
  { re: /bluerazz|blue[-_ ]?razz|blurazz/i, keys: ["myrtille", "framboise"] },
  { re: /bubble[-_ ]?gum|bubblegum/i, keys: ["barbe-a-papa", "fraise"] },
  { re: /limonade|lemonade/i, keys: ["citron", "citron-vert"] },
  { re: /red[-_ ]?fruits/i, keys: ["fraise", "framboise", "cassis"] },
  { re: /exotique|tropical/i, keys: ["mangue", "passion", "ananas"] },
  { re: /mojito/i, keys: ["citron-vert", "menthe"] },
  { re: /funkie/i, keys: ["fraise", "menthe"] },
  { re: /tchatcheur/i, keys: ["citron", "orange"] },
  { re: /ice[-_ ]?cool/i, keys: ["fraise", "framboise", "citron"] },
];

const DEFAULT_FRUITS = ["fraise", "framboise", "myrtille"];

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

export function flavorFruitKeysFromHint(hint: string): string[] {
  const hay = normalizeText(hint);
  const keys: string[] = [];
  for (const rule of FLAVOR_FRUIT_KEYS) {
    if (!rule.re.test(hay)) continue;
    for (const k of rule.keys) if (!keys.includes(k)) keys.push(k);
    if (keys.length >= 3) break;
  }
  return keys.length ? keys.slice(0, 3) : [...DEFAULT_FRUITS];
}

function fruitAssetPath(key: string): string | null {
  const aliases: Record<string, string> = { cola: "pomme", pitaya: "fruit-du-dragon" };
  const p = path.join(FRUIT_DIR, `${aliases[key] || key}.webp`);
  return fs.existsSync(p) ? p : null;
}

async function softWhiteCutout(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Fond blanc / gris très clair (packshots distributeur) → transparent
    if (lum > 235 && sat < 35) px[i + 3] = 0;
    else if (lum > 220 && sat < 28) px[i + 3] = Math.min(px[i + 3], 15);
    else if (lum > 200 && sat < 20) px[i + 3] = Math.min(px[i + 3], 55);
    else if (lum > 185 && sat < 14) px[i + 3] = Math.min(px[i + 3], 110);
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Supprime les auréoles blanches résiduelles sur les bords du détourage. */
async function defringeWhiteHalo(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = Buffer.from(data);
  const idx = (x: number, y: number) => (y * w + x) * 4;

  // Passe 1 : pixels semi-transparents clairs
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const a = px[i + 3];
      if (a === 0) continue;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 200 && sat < 50 && a < 240) {
        px[i + 3] = 0;
      }
    }
  }

  // Passe 2 : frange sur bord (voisin transparent)
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
        if (px[idx(x + dx, y + dy) + 3] < 20) nearClear += 1;
      }
      if (nearClear === 0) continue;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 160 && sat < 55) {
        px[i + 3] = 0;
      } else if (nearClear >= 3 && lum > 140 && sat < 70) {
        px[i + 3] = Math.min(a, 40);
      } else if (nearClear >= 2) {
        // Assombrit la frange pour qu'elle se fonde sur fond noir
        px[i] = Math.round(r * 0.55);
        px[i + 1] = Math.round(g * 0.55);
        px[i + 2] = Math.round(b * 0.55);
        px[i + 3] = Math.min(a, Math.round(a * 0.75));
      }
    }
  }

  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** Sur fond noir : convertit les franges claires de bord en noir (invisibles). */
async function blackOutEdgeFringe(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = Buffer.from(data);
  const idx = (x: number, y: number) => (y * w + x) * 4;

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
        if (px[idx(x + dx, y + dy) + 3] < 30) nearClear += 1;
      }
      if (nearClear === 0) continue;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Frange claire (y compris teintée) → transparent sur fond noir
      if (lum > 110) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
      } else if (nearClear >= 2 && lum > 70) {
        const f = 0.2;
        px[i] = Math.round(r * f);
        px[i + 1] = Math.round(g * f);
        px[i + 2] = Math.round(b * f);
      }
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** Retire le matte blanc (auréole claire) sur pixels semi-transparents. */
async function removeWhiteMatte(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0) continue;
    if (a === 255) {
      // Bord opaque gris/blanc isolé traité ailleurs
      continue;
    }
    const af = a / 255;
    const inv = 1 - af;
    px[i] = Math.min(255, Math.max(0, Math.round((px[i] - 255 * inv) / af)));
    px[i + 1] = Math.min(255, Math.max(0, Math.round((px[i + 1] - 255 * inv) / af)));
    px[i + 2] = Math.min(255, Math.max(0, Math.round((px[i + 2] - 255 * inv) / af)));
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Réduit le masque alpha de `px` pixels pour éliminer les auréoles de bord. */
async function erodeAlphaEdge(input: Buffer, pixels = 1): Promise<Buffer> {
  let cur = input;
  for (let p = 0; p < pixels; p++) {
    const { data, info } = await sharp(cur).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const src = Buffer.from(data);
    const out = Buffer.from(data);
    const idx = (x: number, y: number) => (y * w + x) * 4;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y);
        if (src[i + 3] < 8) continue;
        let minA = src[i + 3];
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          minA = Math.min(minA, src[idx(x + dx, y + dy) + 3]);
        }
        if (minA < 40) {
          out[i + 3] = 0;
        }
      }
    }
    cur = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }
  return cur;
}

async function softBlackCutout(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    if (lum < 12) px[i + 3] = 0;
    else if (lum < 28) px[i + 3] = Math.min(px[i + 3], Math.round((lum / 28) * 255));
  }
  return sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function rembgCutoutFromBuffer(input: Buffer): Buffer | null {
  const tmpIn = path.join(PRODUCT_MEDIA_ROOT, `.rembg-in-${process.pid}-${Date.now()}.bin`);
  const tmpOut = path.join(PRODUCT_MEDIA_ROOT, `.rembg-out-${process.pid}-${Date.now()}.png`);
  try {
    fs.mkdirSync(PRODUCT_MEDIA_ROOT, { recursive: true });
    fs.writeFileSync(tmpIn, input);
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

function litCircleBackgroundSvg(): Buffer {
  const cx = SIZE / 2;
  const cy = Math.round(SIZE * 0.84);
  return Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="disc" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="25%" stop-color="#d7e6f2" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#6a879e" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ring" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="70%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="82%" stop-color="#eaf4ff" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#000000"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${SIZE * 0.3}" ry="${SIZE * 0.06}" fill="url(#disc)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${SIZE * 0.3}" ry="${SIZE * 0.06}" fill="url(#ring)"/>
</svg>`);
}

type Overlay = { input: Buffer; left: number; top: number };

async function buildFruitOverlays(hint: string): Promise<Overlay[]> {
  const keys = flavorFruitKeysFromHint(hint)
    .map(fruitAssetPath)
    .filter((p): p is string => !!p);
  const resolved = keys.length
    ? keys
    : DEFAULT_FRUITS.map(fruitAssetPath).filter((p): p is string => !!p);
  if (!resolved.length) return [];

  const layouts = [
    { scale: 0.52, left: 0.02, top: 0.2, opacity: 0.95 },
    { scale: 0.48, left: 0.52, top: 0.24, opacity: 0.95 },
    { scale: 0.34, left: 0.58, top: 0.08, opacity: 0.9 },
  ];

  const overlays: Overlay[] = [];
  for (let i = 0; i < Math.min(resolved.length, layouts.length); i++) {
    const layout = layouts[i];
    const targetW = Math.round(SIZE * layout.scale);
    let fruitBuf: Buffer = await sharp(resolved[i])
      .resize(targetW, targetW, { fit: "inside" })
      .ensureAlpha()
      .modulate({ brightness: 1.06, saturation: 1.1 })
      .png()
      .toBuffer();
    // Props = RGB noir opaque (pas alpha) → d'abord rendre le noir transparent
    fruitBuf = Buffer.from(await softBlackCutout(fruitBuf));
    fruitBuf = Buffer.from(await removeWhiteMatte(fruitBuf));
    fruitBuf = Buffer.from(await defringeWhiteHalo(fruitBuf));
    fruitBuf = Buffer.from(await erodeAlphaEdge(fruitBuf, 2));
    fruitBuf = Buffer.from(await blackOutEdgeFringe(fruitBuf));
    const meta = await sharp(fruitBuf).metadata();
    const faded = await sharp(fruitBuf)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${meta.width}" height="${meta.height}"><rect width="100%" height="100%" fill="white" fill-opacity="${layout.opacity}"/></svg>`
          ),
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
    overlays.push({
      input: faded,
      left: Math.round(SIZE * layout.left),
      top: Math.round(SIZE * layout.top),
    });
  }
  return overlays;
}

function writeAtomic(tmp: string, dest: string) {
  try {
    fs.renameSync(tmp, dest);
  } catch {
    fs.copyFileSync(tmp, dest);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export type NormalizeImageOptions = {
  /** Buffer image source (brut / packshot). */
  inputBuffer: Buffer;
  /** Chemin absolu de sortie .webp */
  outPath: string;
  /** Nom produit / chemin pour déduire les fruits */
  flavorHint: string;
  /**
   * true = conserver fruits fabricant (e-tasty) via soft black cutout.
   * false = rembg + fruits stock (Liquidarom, Biarritz…).
   */
  keepNativeFruits?: boolean;
  /** Utiliser rembg si dispo (défaut true hors keepNativeFruits). */
  useRembg?: boolean;
  /** true = pas de fruits décor (packshot propre seul + cercle). */
  skipFruitOverlays?: boolean;
};

/**
 * Applique le style e-tasty et écrit outPath + thumb.
 * Ne s'arrête pas tant que l'écriture n'est pas faite (fallback sharp si rembg échoue).
 */
export async function normalizeProductImageToEtastyStyle(
  opts: NormalizeImageOptions
): Promise<{ outPath: string; thumbPath: string }> {
  const keepNative = !!opts.keepNativeFruits;
  const useRembg = opts.useRembg !== false && !keepNative;

  let cutout: Buffer | null = null;
  if (keepNative) {
    // e-tasty : fond déjà noir — retirer uniquement le noir, puis défanger
    cutout = await softBlackCutout(opts.inputBuffer);
    cutout = await defringeWhiteHalo(cutout);
  } else if (useRembg) {
    cutout = rembgCutoutFromBuffer(opts.inputBuffer);
    if (cutout) {
      cutout = await softWhiteCutout(cutout);
      cutout = await defringeWhiteHalo(cutout);
    }
  }
  if (!cutout) {
    // Packshot fond blanc (Kuix, distributeurs…) — style e-tasty obligatoire
    cutout = await softWhiteCutout(opts.inputBuffer);
    cutout = await softBlackCutout(cutout);
    cutout = await defringeWhiteHalo(cutout);
  }

  const trimmed = await sharp(cutout)
    .trim({ threshold: 10 })
    .modulate({ brightness: 1.05, saturation: 1.04 })
    .sharpen({ sigma: 0.85, m1: 0.6, m2: 0.3 })
    .resize(PRODUCT_MAX, PRODUCT_MAX, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  // Défange après resize (ré-échantillonnage peut recréer une frange claire)
  let cleaned = await removeWhiteMatte(trimmed);
  cleaned = await defringeWhiteHalo(cleaned);
  // Érosion / blackOut agressifs réservés aux fruits (sinon détruit bouchons or / reflets)
  if (!opts.skipFruitOverlays && !keepNative) {
    cleaned = await erodeAlphaEdge(cleaned, 1);
  }
  const meta = await sharp(cleaned).metadata();
  const sw = meta.width || PRODUCT_MAX;
  const sh = meta.height || PRODUCT_MAX;
  const left = Math.round((SIZE - sw) / 2);
  const circleY = Math.round(SIZE * 0.84);
  const top = Math.max(40, Math.round(circleY - sh + sh * 0.06));

  const fruits =
    keepNative || opts.skipFruitOverlays ? [] : await buildFruitOverlays(opts.flavorHint);
  const background = await sharp(litCircleBackgroundSvg()).png().toBuffer();

  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  const tmpOut = `${opts.outPath}.tmp-${process.pid}-${Date.now()}.webp`;
  await sharp(background)
    .composite([...fruits, { input: cleaned, left, top }])
    .webp({ quality: 94, effort: 5 })
    .toFile(tmpOut);
  writeAtomic(tmpOut, opts.outPath);

  const thumbPath = opts.outPath.replace(/\.(webp|jpe?g|png)$/i, "-thumb.webp");
  const tmpThumb = `${thumbPath}.tmp-${process.pid}-${Date.now()}.webp`;
  await sharp(opts.outPath).resize(640, 640, { fit: "inside" }).webp({ quality: 88 }).toFile(tmpThumb);
  writeAtomic(tmpThumb, thumbPath);

  return { outPath: opts.outPath, thumbPath };
}

function localPathFromPublicUrl(url: string): string | null {
  const clean = url.split("?")[0];
  if (!clean.startsWith("/media/")) return null;
  const abs = path.join(ROOT, "public", clean.replace(/^\//, ""));
  return fs.existsSync(abs) ? abs : null;
}

function isEtastyHint(hint: string): boolean {
  return /e[-_. ]?tasty|etasty/i.test(hint);
}

/**
 * Point d'entrée API / import : normalise une image produit (locale ou URL distante)
 * et renvoie l'URL publique `/media/products/...`.
 * OBLIGATOIRE à chaque ajout / mise à jour d'image.
 */
export async function ensureProductImageEtastyStyle(params: {
  sourceUrl: string;
  productName: string;
  brand?: string | null;
  manufacturerSlug?: string | null;
  rangeSlug?: string | null;
  format?: string | null;
  productSlug?: string | null;
}): Promise<string> {
  const hint = [
    params.brand,
    params.manufacturerSlug,
    params.rangeSlug,
    params.productName,
    params.sourceUrl,
  ]
    .filter(Boolean)
    .join(" ");

  const keepNative = isEtastyHint(hint);
  let inputBuffer: Buffer;
  let outPath: string;

  const local = localPathFromPublicUrl(params.sourceUrl);
  if (local) {
    // Backup avant écrasement
    const rel = path.relative(PRODUCT_MEDIA_ROOT, local);
    if (!rel.startsWith("..")) {
      const backup = path.join(BACKUP_ROOT, rel);
      if (!fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(local, backup);
      }
      inputBuffer = fs.readFileSync(fs.existsSync(backup) ? backup : local);
    } else {
      inputBuffer = fs.readFileSync(local);
    }
    outPath = local.replace(/\.(jpe?g|png)$/i, ".webp");
  } else if (/^https?:\/\//i.test(params.sourceUrl)) {
    const res = await fetch(params.sourceUrl, {
      headers: { "User-Agent": "AllVapsImageNormalize/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Téléchargement image impossible (${res.status})`);
    inputBuffer = Buffer.from(await res.arrayBuffer());
    const mfr = normalizeText(params.manufacturerSlug || params.brand || "divers");
    const range = normalizeText(params.rangeSlug || "gamme");
    const format = normalizeText(params.format || "50ml");
    const slug = normalizeText(params.productSlug || params.productName).slice(0, 80) || `product-${Date.now()}`;
    outPath = path.join(PRODUCT_MEDIA_ROOT, mfr, range, format, `${slug}.webp`);
  } else if (params.sourceUrl.startsWith("/")) {
    // Chemin public pas encore sur disque
    throw new Error(`Image locale introuvable: ${params.sourceUrl}`);
  } else {
    throw new Error(`URL image non supportée: ${params.sourceUrl}`);
  }

  await normalizeProductImageToEtastyStyle({
    inputBuffer,
    outPath,
    flavorHint: hint,
    keepNativeFruits: keepNative,
  });

  const publicUrl = `/media/products/${path
    .relative(PRODUCT_MEDIA_ROOT, outPath)
    .split(path.sep)
    .join("/")}`;
  return publicUrl;
}
