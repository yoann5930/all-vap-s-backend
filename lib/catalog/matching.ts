import { normalizeProductName } from "@/lib/catalog/normalize";

export type MatchMethod =
  | "sumup_id"
  | "barcode"
  | "sku"
  | "supplier_ref"
  | "normalized_name"
  | "fuzzy_name"
  | "none";

export type MatchDecision = "AUTO" | "REVIEW" | "UNMATCHED";

export interface CatalogMatchCandidate {
  id: string;
  name: string;
  normalizedName: string | null;
  sku: string | null;
  barcode: string | null;
  sumupProductId: string | null;
  brand: string | null;
}

export interface MatchResult {
  productId: string | null;
  method: MatchMethod;
  confidence: number;
  decision: MatchDecision;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur =
        a[i] === b[j] ? row[j] : Math.min(row[j], row[j + 1], prev) + 1;
      row[j] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

export interface SourceIdentity {
  name: string;
  normalizedName: string;
  barcode?: string | null;
  sku?: string | null;
  sumupProductId?: string | null;
  supplierRef?: string | null;
}

/**
 * Ordre : SumUp ID → barcode → SKU → ref fournisseur → nom normalisé exact → fuzzy.
 * Auto-match uniquement si confidence >= 0.95.
 * 0.75–0.94 → REVIEW (jamais fusion auto).
 * < 0.75 → UNMATCHED.
 */
export function matchCatalogProduct(
  source: SourceIdentity,
  catalog: CatalogMatchCandidate[]
): MatchResult {
  const barcode = source.barcode?.trim() || null;
  const sku = source.sku?.trim() || null;
  const sumupId = source.sumupProductId?.trim() || null;
  const supplierRef = source.supplierRef?.trim() || null;
  const norm = source.normalizedName || normalizeProductName(source.name);

  if (sumupId) {
    const hit = catalog.find((p) => p.sumupProductId === sumupId);
    if (hit) {
      return { productId: hit.id, method: "sumup_id", confidence: 1, decision: "AUTO" };
    }
  }

  if (barcode) {
    const hit = catalog.find((p) => p.barcode && p.barcode === barcode);
    if (hit) {
      return { productId: hit.id, method: "barcode", confidence: 1, decision: "AUTO" };
    }
  }

  if (sku) {
    const hit = catalog.find((p) => p.sku && p.sku.toLowerCase() === sku.toLowerCase());
    if (hit) {
      return { productId: hit.id, method: "sku", confidence: 1, decision: "AUTO" };
    }
  }

  if (supplierRef) {
    const ref = supplierRef.toLowerCase();
    const hit = catalog.find(
      (p) =>
        (p.sku && p.sku.toLowerCase() === ref) ||
        (p.sumupProductId && p.sumupProductId.toLowerCase() === ref)
    );
    if (hit) {
      return { productId: hit.id, method: "supplier_ref", confidence: 1, decision: "AUTO" };
    }
  }

  const exact = catalog.find(
    (p) => (p.normalizedName || normalizeProductName(p.name)) === norm
  );
  if (exact) {
    return {
      productId: exact.id,
      method: "normalized_name",
      confidence: 1,
      decision: "AUTO",
    };
  }

  let best: { id: string; score: number } | null = null;
  for (const p of catalog) {
    const pNorm = p.normalizedName || normalizeProductName(p.name);
    const score = similarity(norm, pNorm);
    if (!best || score > best.score) best = { id: p.id, score };
  }

  if (best && best.score >= 0.95) {
    return {
      productId: best.id,
      method: "fuzzy_name",
      confidence: best.score,
      decision: "AUTO",
    };
  }

  if (best && best.score >= 0.75) {
    return {
      productId: best.id,
      method: "fuzzy_name",
      confidence: best.score,
      decision: "REVIEW",
    };
  }

  return {
    productId: best && best.score >= 0.5 ? best.id : null,
    method: best ? "fuzzy_name" : "none",
    confidence: best?.score ?? 0,
    decision: "UNMATCHED",
  };
}
