/**
 * Vérificateur de contradictions contraintes ↔ produit candidat.
 * Pack Work 2026-08-09 — branché sur le contexte A.V.A. réel.
 */
import type { AvaCatalogProduct, AvaSearchCriteria } from "./types";
import { resolveCanonicalProductKind } from "@/lib/catalog/product-advice-profile";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function contradictionReasons(
  criteria: AvaSearchCriteria,
  product: AvaCatalogProduct
): string[] {
  const reasons: string[] = [];
  const blob = norm(
    [
      product.name,
      product.brand,
      product.manufacturerName,
      product.range,
      product.flavorFamily,
      product.primaryFlavor,
      ...(product.flavors || []),
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (criteria.volumeMl != null) {
    const volOk =
      (product.volumeMl != null && Math.abs(product.volumeMl - criteria.volumeMl) < 1) ||
      product.variants.some(
        (v) => v.capacityMl != null && Math.abs(v.capacityMl - criteria.volumeMl!) < 1
      ) ||
      blob.includes(`${criteria.volumeMl} ml`) ||
      blob.includes(`${criteria.volumeMl}ml`);
    if (!volOk) reasons.push("VOLUME_MISMATCH");
  }

  if (criteria.manufacturer) {
    const m = norm(criteria.manufacturer);
    const brandBlob = `${norm(product.brand ?? "")} ${norm(product.manufacturerName ?? "")} ${norm(product.name)}`;
    if (!brandBlob.includes(m)) reasons.push("MANUFACTURER_MISMATCH");
  }

  if (criteria.freshness === "without") {
    if (/\bice\b|\bfreeze\b|\bcool\b|\bfrais\b|\bfraicheur\b|\bmenthol\b|\bglace\b/.test(blob)) {
      if (product.isFresh !== false) reasons.push("EXCLUDED_TRAIT:fresh");
    }
  }

  if (criteria.category === "e-liquides") {
    const kind = resolveCanonicalProductKind({
      category: product.category,
      productType: product.productType,
      name: product.name,
      range: product.range,
    });
    if (kind === "DIY_CONCENTRATE") reasons.push("TYPE_MISMATCH:DIY_CONCENTRATE");
  }

  return reasons;
}

/** Filtre strict avant scoring — les contradictions sont exclues. */
export function filterContradictions(
  criteria: AvaSearchCriteria,
  products: AvaCatalogProduct[]
): AvaCatalogProduct[] {
  return products.filter((p) => contradictionReasons(criteria, p).length === 0);
}
