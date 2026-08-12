/**
 * Déduit l’URL packshot depuis le disque si Product.imageUrl est vide.
 * Convention : public/media/products/{mfr}/{range}/{50|100}ml/{flavor}.webp
 * Ne modifie jamais la DB / stock.
 */
import fs from "node:fs";
import path from "node:path";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

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

function listPackshots(mfrSlug: string, rangeSlug: string): Array<{ flavor: string; url: string }> {
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

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aa = a.split("-").filter(Boolean);
  const bb = b.split("-").filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  return aa.filter((t) => bb.includes(t)).length / Math.max(aa.length, bb.length);
}

const cache = new Map<string, Array<{ flavor: string; url: string }>>();

export function inferProductPackshotUrl(params: {
  imageUrl?: string | null;
  productName: string;
  manufacturerSlug?: string | null;
  manufacturerName?: string | null;
  rangeSlug?: string | null;
  rangeName?: string | null;
}): string | null {
  if (params.imageUrl) return params.imageUrl;
  const mfr = params.manufacturerSlug;
  const range = params.rangeSlug;
  if (!mfr || !range) return null;

  const key = `${mfr}/${range}`;
  let files = cache.get(key);
  if (!files) {
    files = listPackshots(mfr, range);
    cache.set(key, files);
  }
  if (!files.length) return null;

  const pf = flavorTokens(params.productName, params.manufacturerName, params.rangeName);
  let bestUrl: string | null = null;
  let best = 0;
  for (const f of files) {
    const alts = [f.flavor, EN_FR[f.flavor]].filter(Boolean) as string[];
    for (const alt of alts) {
      const sc = score(alt, pf);
      if (sc > best) {
        best = sc;
        bestUrl = f.url;
      }
    }
  }
  return best >= 0.55 ? bestUrl : null;
}
