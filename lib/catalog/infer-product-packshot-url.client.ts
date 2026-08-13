/**
 * Inférence packshot côté client (navigateur) — index JSON uniquement, pas de fs.
 * Même règles de score que le serveur pour éviter desktop ≠ mobile.
 */
import packshotIndex from "@/data/catalog/packshot-index.json";

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
  s = s.replace(/[&+/]+/g, " ");
  s = s.replace(/[—–>-]+/g, " ");
  return norm(s);
}

function score(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = a.split("-").filter(Boolean);
  const bb = b.split("-").filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const inter = aa.filter((t) => bb.includes(t)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = inter / union;
  if (aa.length === bb.length && jaccard === 1) return 1;
  if (Math.abs(aa.length - bb.length) <= 1 && jaccard >= 0.85) return jaccard;
  return jaccard >= 0.7 ? jaccard * 0.9 : jaccard;
}

function flavorFromMediaUrl(url: string): string | null {
  if (!url.startsWith("/media/products/")) return null;
  const base = url.split("/").pop() || "";
  if (!/\.webp$/i.test(base) || /-thumb\.webp$/i.test(base)) return null;
  return norm(base.replace(/\.webp$/i, ""));
}

function urlMatchesProduct(url: string, productFlavor: string): boolean {
  const fileFlavor = flavorFromMediaUrl(url);
  if (!fileFlavor || !productFlavor) return false;
  const alts = [fileFlavor, EN_FR[fileFlavor]].filter(Boolean) as string[];
  return alts.some((alt) => score(alt, productFlavor) >= CERTAIN);
}

export function inferProductPackshotUrlClient(params: {
  imageUrl?: string | null;
  productName: string;
  manufacturerSlug?: string | null;
  manufacturerName?: string | null;
  rangeSlug?: string | null;
  rangeName?: string | null;
}): string | null {
  const pf = flavorTokens(params.productName, params.manufacturerName, params.rangeName);

  if (params.imageUrl && urlMatchesProduct(params.imageUrl, pf)) {
    return params.imageUrl;
  }

  const mfr = params.manufacturerSlug;
  const range = params.rangeSlug;
  if (!mfr || !range) return null;
  const files =
    (packshotIndex as { ranges?: Record<string, Array<{ flavor: string; url: string }>> })
      .ranges?.[`${mfr}/${range}`] ?? [];
  if (!files.length) return null;

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
  if (best < CERTAIN) return null;
  if (second >= CERTAIN && best - second < 0.05) return null;
  return bestUrl;
}
