/**
 * Classification e-liquides : Fabricant → Gamme → Produit (lecture + heuristiques).
 * Ne modifie pas les stocks. N'invente pas de fabricant/gamme absents des sources.
 */
import fs from "node:fs";
import path from "node:path";
import {
  extractEliquidVolumeMl,
  isReadyToVapeEliquid,
} from "@/lib/catalog/manufacturer-volumes";
import {
  A_CLASSER_NAME,
  A_CLASSER_SLUG,
  AMBIGUOUS_REVIEW_PATTERNS,
  CERTAIN_RANGE_TOKENS,
  type ClassificationStatus,
} from "@/lib/catalog/eliquide-range-tokens";
import {
  isEliquideCategory,
  loadKnownManufacturers,
  looksLikeEliquidName,
  norm,
  type KnownManufacturer,
} from "@/lib/catalog/sumup-eliquide-manufacturers";

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "public", "media", "manufacturers");

export type ClassifiedProductRow = {
  rawName: string;
  displayName: string | null;
  category: string;
  sku: string | null;
  barcode: string | null;
  volumeMl: number | null;
  manufacturerSlug: string | null;
  manufacturerName: string | null;
  rangeSlug: string | null;
  rangeName: string | null;
  classificationStatus: ClassificationStatus;
  sources: string[];
  isEliquid: boolean;
  reason?: string;
  sumupItemId?: string | null;
  sourceFiles: string[];
};

export function coverExists(mfrSlug: string, rangeSlug: string): boolean {
  const dir = path.join(MEDIA, mfrSlug, "ranges");
  if (!fs.existsSync(dir)) return false;
  const bases = [rangeSlug];
  if (!rangeSlug.endsWith(`-${mfrSlug}`)) bases.push(`${rangeSlug}-${mfrSlug}`);
  return bases.some((base) =>
    ["webp", "jpg", "jpeg", "png"].some((ext) =>
      fs.existsSync(path.join(dir, `${base}.${ext}`))
    )
  );
}

export function matchKnownManufacturer(
  productName: string,
  known: KnownManufacturer[] = loadKnownManufacturers()
): { slug: string; name: string } | null {
  const n = norm(productName);
  if (!n) return null;
  const ranked = [...known].sort((a, b) => {
    const score = (m: KnownManufacturer) =>
      Math.max(norm(m.name).length, ...m.aliases.map((x) => norm(x).length), 0);
    return score(b) - score(a);
  });
  for (const m of ranked) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")]
      .map(norm)
      .filter((x) => x.length >= 3);
    if (needles.some((x) => n.includes(x))) {
      return { slug: m.slug, name: m.name };
    }
  }
  // Range-only certain → manufacturer
  for (const [mfrSlug, ranges] of Object.entries(CERTAIN_RANGE_TOKENS)) {
    for (const r of ranges) {
      const tn = norm(r.token);
      if (tn.length >= 4 && n.includes(tn) && coverExists(mfrSlug, r.rangeSlug)) {
        const m = known.find((k) => k.slug === mfrSlug);
        return { slug: mfrSlug, name: m?.name || mfrSlug };
      }
    }
  }
  return null;
}

export function matchCertainRange(
  productName: string,
  mfrSlug: string
): { rangeSlug: string; token: string } | null {
  const n = norm(productName);
  const tokens = CERTAIN_RANGE_TOKENS[mfrSlug] || [];
  // Longer tokens first
  const ranked = [...tokens].sort(
    (a, b) => norm(b.token).length - norm(a.token).length
  );
  for (const t of ranked) {
    const tn = norm(t.token);
    if (tn.length < 3) continue;
    if (!n.includes(tn)) continue;
    if (t.rangeSlug === "enfer" && !/vape\s*47|enfer/i.test(productName)) {
      continue;
    }
    return { rangeSlug: t.rangeSlug, token: t.token };
  }
  return null;
}

export function titleFromRangeSlug(rangeSlug: string, mfrSlug: string): string {
  if (rangeSlug === A_CLASSER_SLUG) return A_CLASSER_NAME;
  let base = rangeSlug;
  if (base.endsWith(`-${mfrSlug}`)) {
    base = base.slice(0, -(mfrSlug.length + 1));
  }
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Retire fabricant / gamme / volume du nom pour un displayName approximatif. */
export function guessDisplayName(
  rawName: string,
  mfrName: string | null,
  rangeToken: string | null
): string {
  let s = rawName;
  if (mfrName) {
    const re = new RegExp(mfrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    s = s.replace(re, " ");
  }
  if (rangeToken) {
    const re = new RegExp(rangeToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    s = s.replace(re, " ");
  }
  s = s
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/[-–—|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || rawName;
}

export function classifyProductName(params: {
  rawName: string;
  category?: string | null;
  sku?: string | null;
  barcode?: string | null;
  sumupItemId?: string | null;
  sourceFiles?: string[];
  known?: KnownManufacturer[];
}): ClassifiedProductRow {
  const rawName = params.rawName.trim();
  const category = (params.category || "").trim();
  const sources: string[] = [];
  const sourceFiles = params.sourceFiles || [];
  const known = params.known || loadKnownManufacturers();

  const isEliquid =
    isReadyToVapeEliquid({ name: rawName, category }) ||
    isEliquideCategory(category) ||
    looksLikeEliquidName(rawName);

  const vol = extractEliquidVolumeMl({ name: rawName });
  const n = norm(rawName);

  for (const amb of AMBIGUOUS_REVIEW_PATTERNS) {
    if (amb.test(n)) {
      return {
        rawName,
        displayName: guessDisplayName(rawName, null, null),
        category,
        sku: params.sku || null,
        barcode: params.barcode || null,
        volumeMl: vol?.ml ?? null,
        manufacturerSlug: null,
        manufacturerName: null,
        rangeSlug: null,
        rangeName: null,
        classificationStatus: "TO_REVIEW",
        sources: ["ambiguous_pattern", amb.reason],
        isEliquid,
        reason: amb.reason,
        sumupItemId: params.sumupItemId || null,
        sourceFiles,
      };
    }
  }

  if (!isEliquid) {
    return {
      rawName,
      displayName: null,
      category,
      sku: params.sku || null,
      barcode: params.barcode || null,
      volumeMl: vol?.ml ?? null,
      manufacturerSlug: null,
      manufacturerName: null,
      rangeSlug: null,
      rangeName: null,
      classificationStatus: "UNCLASSIFIED",
      sources: ["not_eliquid"],
      isEliquid: false,
      reason: "not_eliquid",
      sumupItemId: params.sumupItemId || null,
      sourceFiles,
    };
  }

  const mfr = matchKnownManufacturer(rawName, known);
  if (!mfr) {
    return {
      rawName,
      displayName: guessDisplayName(rawName, null, null),
      category,
      sku: params.sku || null,
      barcode: params.barcode || null,
      volumeMl: vol?.ml ?? null,
      manufacturerSlug: null,
      manufacturerName: null,
      rangeSlug: null,
      rangeName: null,
      classificationStatus: "UNCLASSIFIED",
      sources: ["no_manufacturer"],
      isEliquid: true,
      reason: "no_manufacturer",
      sumupItemId: params.sumupItemId || null,
      sourceFiles,
    };
  }
  sources.push("manufacturer_match");

  const rangeHit = matchCertainRange(rawName, mfr.slug);
  if (rangeHit) {
    sources.push("token_range", `token:${rangeHit.token}`);
    const hasCover = coverExists(mfr.slug, rangeHit.rangeSlug);
    if (hasCover) sources.push("range_cover");
    const status: ClassificationStatus = hasCover
      ? "CONFIRMED"
      : "AUTO_CLASSIFIED";
    return {
      rawName,
      displayName: guessDisplayName(rawName, mfr.name, rangeHit.token),
      category,
      sku: params.sku || null,
      barcode: params.barcode || null,
      volumeMl: vol?.ml ?? null,
      manufacturerSlug: mfr.slug,
      manufacturerName: mfr.name,
      rangeSlug: rangeHit.rangeSlug,
      rangeName: titleFromRangeSlug(rangeHit.rangeSlug, mfr.slug),
      classificationStatus: status,
      sources,
      isEliquid: true,
      sumupItemId: params.sumupItemId || null,
      sourceFiles,
    };
  }

  // Fabricant certain, gamme inconnue → À CLASSER (AUTO si logo fabricant, sinon TO_REVIEW faible)
  sources.push("a_classer");
  return {
    rawName,
    displayName: guessDisplayName(rawName, mfr.name, null),
    category,
    sku: params.sku || null,
    barcode: params.barcode || null,
    volumeMl: vol?.ml ?? null,
    manufacturerSlug: mfr.slug,
    manufacturerName: mfr.name,
    rangeSlug: A_CLASSER_SLUG,
    rangeName: A_CLASSER_NAME,
    classificationStatus: "AUTO_CLASSIFIED",
    sources,
    isEliquid: true,
    reason: "manufacturer_ok_range_unknown",
    sumupItemId: params.sumupItemId || null,
    sourceFiles,
  };
}
