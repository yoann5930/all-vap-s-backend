/**
 * Déduit l’URL packshot si Product.imageUrl est vide / fichier absent.
 * Source primaire : data/catalog/packshot-index.json (fonctionne sur Vercel).
 * Fallback disque : public/media/products/{mfr}/{range}/… (dev local).
 * Ne modifie jamais la DB / stock.
 *
 * Règle : fabricant → gamme → saveur, score certain ≥ 0.7
 * (aligné scripts/reimplant-liquidarom-ice-cool-photos.ts + attach-existing-media-photos-safe.ts).
 */
import fs from "node:fs";
import path from "node:path";
import packshotIndex from "@/data/catalog/packshot-index.json";

const PUBLIC_ROOT = path.join(process.cwd(), "public");
const CERTAIN = 0.7;

const EN_FR: Record<string, string> = {
  "blackberry-raspberry": "mure-framboise",
  "blackcurrant-raspberry-grape": "cassis-framboise-raisin",
  "blue-raspberry-pitaya": "framboise-bleue-pitaya",
  "mixed-red-berries": "fruits-rouges",
  "mixed-berries": "fruits-rouges",
  "watermelon-lemon": "pasteque-citron",
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function flavorTokens(name: string, manufacturerName?: string | null, rangeName?: string | null) {
  let s = name;
  if (manufacturerName) {
    s = s.replace(new RegExp(manufacturerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  if (rangeName) {
    s = s.replace(new RegExp(rangeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  s = s.replace(/ice\s*cool\s*x?/gi, " ");
  s = s.replace(/\b\d+\s*ml\b/gi, " ");
  s = s.replace(/\b\d+\s*mg\b/gi, " ");
  s = s.replace(/e-?liquide/gi, " ");
  s = s.replace(/[—–>-]+/g, " ");
  return norm(s);
}

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aa = a.split("-").filter(Boolean);
  const bb = b.split("-").filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  return aa.filter((t) => bb.includes(t)).length / Math.max(aa.length, bb.length);
}

function listFromDisk(mfrSlug: string, rangeSlug: string): Array<{ flavor: string; url: string }> {
  const root = path.join(PUBLIC_ROOT, "media", "products", mfrSlug, rangeSlug);
  if (!fs.existsSync(root)) return [];
  const out: Array<{ flavor: string; url: string }> = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/_backup/i.test(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.webp$/i.test(ent.name) || /-thumb\.webp$/i.test(ent.name)) continue;
      const flavor = norm(ent.name.replace(/\.webp$/i, ""));
      const rel = "/" + path.relative(PUBLIC_ROOT, full).replace(/\\/g, "/");
      out.push({ flavor, url: rel });
    }
  };
  walk(root);
  return out;
}

function listPackshots(mfrSlug: string, rangeSlug: string): Array<{ flavor: string; url: string }> {
  const key = `${mfrSlug}/${rangeSlug}`;
  const fromIndex = (packshotIndex as { ranges?: Record<string, Array<{ flavor: string; url: string }>> })
    .ranges?.[key];
  if (fromIndex?.length) return fromIndex;
  return listFromDisk(mfrSlug, rangeSlug);
}

export function inferProductPackshotUrl(params: {
  imageUrl?: string | null;
  productName: string;
  manufacturerSlug?: string | null;
  manufacturerName?: string | null;
  rangeSlug?: string | null;
  rangeName?: string | null;
}): string | null {
  // Garder imageUrl DB si fichier présent localement ; sur Vercel le fichier
  // peut être absent du FS serveur tout en étant servi en CDN → on conserve
  // toute URL /media/products/ déjà stockée.
  if (params.imageUrl) {
    if (params.imageUrl.startsWith("/media/products/")) return params.imageUrl;
    const abs = path.join(PUBLIC_ROOT, params.imageUrl.replace(/^\//, ""));
    if (fs.existsSync(abs)) return params.imageUrl;
  }
  const mfr = params.manufacturerSlug;
  const range = params.rangeSlug;
  if (!mfr || !range) return null;

  const files = listPackshots(mfr, range);
  if (!files.length) return null;

  const pf = flavorTokens(params.productName, params.manufacturerName, params.rangeName);
  let bestUrl: string | null = null;
  let best = 0;
  let second = 0;
  for (const f of files) {
    const alts = [f.flavor, EN_FR[f.flavor]].filter(Boolean) as string[];
    for (const alt of alts) {
      const sc = score(alt, pf);
      if (sc > best) {
        second = best;
        best = sc;
        bestUrl = f.url;
      } else if (sc > second) {
        second = sc;
      }
    }
  }
  // Certain uniquement : ≥ 0.7 et écart ou second < certain
  if (best < CERTAIN) return null;
  if (second >= CERTAIN && best - second < 0.05) return null;
  return bestUrl;
}
