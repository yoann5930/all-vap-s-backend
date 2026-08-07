/**
 * Contenances e-liquides par fabricant — source = catalogue All Vap's (SumUp).
 * Pas d'invention : seuls les volumes détectés sur des produits référencés.
 */
import { isEliquideCategory, looksLikeEliquidName } from "@/lib/catalog/sumup-eliquide-manufacturers";

export type VolumeSource = "volumeMl" | "capacityMl" | "productType" | "name";

export type ProductVolumeHit = {
  ml: number;
  source: VolumeSource;
  confidence: "high" | "low";
};

/** Exclut concentrés, boosters, bases, DIY, pods — pas des e-liquides prêts à vaper flacon. */
export function isReadyToVapeEliquid(params: {
  name: string;
  category?: string | null;
  productType?: string | null;
}): boolean {
  const n = params.name.toLowerCase();
  // Ne pas confondre « Aromes & Secrets » (fabricant) avec un arôme DIY
  const isAromesSecretsBrand = /ar[oô]mes?\s*&\s*secrets/i.test(params.name);
  if (/\bconcentr[eé]s?\b/i.test(n)) return false;
  if (/\bbooster\b|\bbases?\b|\bdiy\b|\bshooter\b|\bnicotine\s*base\b/i.test(n)) {
    return false;
  }
  if (!isAromesSecretsBrand && /\bar[oô]me\b/i.test(n)) return false;
  // Pods / puffs / cartouches — pas des flacons e-liquide catalogue
  if (
    /\bcartouche\b|\bpuff\b|\bpod\b|\blost\s*mary\b|\belfbar\b|\bdispos/i.test(n)
  ) {
    return false;
  }
  if (params.productType && /concentr|arome|booster|base|diy|pod|puff/i.test(params.productType)) {
    return false;
  }
  const cat = (params.category || "").toLowerCase();
  if (cat && /concentr|ar[oô]me|booster|base|diy|pod|puff|cigarette/i.test(cat)) return false;
  if (cat && isEliquideCategory(cat)) return true;
  // Produits déjà rattachés fabricant e-liquide : accepter si nom ressemble à un flacon
  if (looksLikeEliquidName(params.name)) return true;
  // volume explicite dans le nom sans marqueur concentré
  if (/\b\d+\s*ml\b/i.test(params.name)) return true;
  return false;
}

/**
 * Le produit « appartient » vraiment à ce fabricant pour le calcul de contenances :
 * nom évoque le fabricant, OU produit sur une gamme de ce fabricant (déjà filtré en amont).
 */
export function productBelongsToManufacturerForVolumes(params: {
  productName: string;
  manufacturerName: string;
  manufacturerSlug: string;
  manufacturerAliases?: string[];
  hasRangeOnManufacturer: boolean;
}): boolean {
  if (params.hasRangeOnManufacturer) return true;
  const n = normLoose(params.productName);
  const needles = [
    params.manufacturerName,
    params.manufacturerSlug.replace(/-/g, " "),
    ...(params.manufacturerAliases || []),
  ]
    .map(normLoose)
    .filter((x) => x.length >= 3);
  return needles.some((x) => n.includes(x));
}

function normLoose(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Marques fréquemment mal rattachées — si citées dans le nom, hors du fabricant courant. */
const FOREIGN_BRAND_MARKERS: Array<{ slug: string; needles: string[] }> = [
  { slug: "e-tasty", needles: ["e tasty", "e-tasty", "etasty"] },
  { slug: "liquidarom", needles: ["liquidarom"] },
  { slug: "vap-air", needles: ["vap air", "vap'air", "by vap air"] },
  { slug: "the-fuu", needles: ["the fuu", "cloud empire", "fuug life"] },
  { slug: "biarritz-lab", needles: ["biarritz lab", "double dragon", "mamita"] },
  { slug: "raneki-liquide", needles: ["raneki"] },
  { slug: "liquideo", needles: ["liquideo"] },
  { slug: "swoke", needles: ["swoke"] },
  { slug: "protect", needles: ["protect"] },
  { slug: "vape-47", needles: ["vape 47", "vape47", "furiosa", "enfer"] },
];

export function citesForeignManufacturer(
  productName: string,
  currentManufacturerSlug: string
): boolean {
  const n = normLoose(productName);
  for (const m of FOREIGN_BRAND_MARKERS) {
    if (m.slug === currentManufacturerSlug) continue;
    if (m.needles.some((needle) => n.includes(normLoose(needle)))) return true;
  }
  return false;
}

/**
 * Détecte une contenance flacon (ml) depuis les champs produit.
 * Ignore les faux positifs type « 20 mg » (nicotine).
 */
export function extractEliquidVolumeMl(params: {
  name: string;
  volumeMl?: number | null;
  productType?: string | null;
  variantCapacityMl?: Array<number | null | undefined>;
}): ProductVolumeHit | null {
  if (params.volumeMl != null && Number.isFinite(params.volumeMl) && params.volumeMl > 0) {
    const ml = Math.round(params.volumeMl);
    if (ml >= 5 && ml <= 1000) {
      return { ml, source: "volumeMl", confidence: "high" };
    }
  }

  const fromVariants = (params.variantCapacityMl || [])
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
    .map((v) => Math.round(v))
    .filter((v) => v >= 5 && v <= 1000);
  if (fromVariants.length) {
    // Capacité la plus fréquente parmi les variants
    const counts = new Map<number, number>();
    for (const v of fromVariants) counts.set(v, (counts.get(v) || 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
    return { ml: best[0], source: "capacityMl", confidence: "high" };
  }

  if (params.productType) {
    const m = params.productType.match(/(\d+)\s*ml/i);
    if (m) {
      const ml = Number(m[1]);
      if (ml >= 5 && ml <= 1000) {
        return { ml, source: "productType", confidence: "high" };
      }
    }
  }

  // Nom : tous les « N ml » (parfois « 50 ml / 10 ml sels ») — prendre le volume flacon principal
  const nameHits = [...params.name.matchAll(/\b(\d+(?:[.,]\d+)?)\s*ml\b/gi)].map((m) =>
    Math.round(Number(m[1]!.replace(",", ".")))
  );
  const plausible = nameHits.filter((ml) => ml >= 5 && ml <= 1000);
  if (!plausible.length) return null;

  // Si plusieurs (ex. 50 ml / 10 ml sels) : privilégier le plus grand = flacon shortfill typique
  // sauf si un seul est dans {10,20,30,50,60,75,100,120,200}
  const common = new Set([10, 20, 30, 50, 60, 75, 100, 120, 200]);
  const preferred = plausible.filter((ml) => common.has(ml));
  const pool = preferred.length ? preferred : plausible;
  const ml = Math.max(...pool);
  return {
    ml,
    source: "name",
    confidence: plausible.length === 1 ? "high" : "low",
  };
}

export function formatManufacturerVolumeSubtitle(volumesMl: number[]): string {
  const sorted = [...new Set(volumesMl.filter((v) => v > 0))]
    .sort((a, b) => a - b)
    .map((ml) => `${ml} ML`);
  if (!sorted.length) return "E-LIQUIDES";
  return `E-LIQUIDES · ${sorted.join(" · ")}`;
}

export type ManufacturerVolumeSummary = {
  manufacturerId: string;
  slug: string;
  name: string;
  volumesMl: number[];
  subtitle: string;
  productCount: number;
  ambiguousProductNames: string[];
};
