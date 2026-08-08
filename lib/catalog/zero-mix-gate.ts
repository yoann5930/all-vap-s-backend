/**
 * Gate d'affichage zéro-mélange — avant tout rendu catalogue.
 * Si une vérification échoue → ne pas afficher.
 */
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  parseNameProvenance,
} from "@/lib/catalog/official-sumup-policy";
import { isGroupPhotoUrl } from "@/lib/catalog/images";

export type ZeroMixProductInput = {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean | null;
  visibleOnline?: boolean | null;
  catalogStatus?: string | null;
  category?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  manufacturerId?: string | null;
  rangeId?: string | null;
  imageUrl?: string | null;
  imageStatus?: string | null;
  sumupName?: string | null;
  sumupProductId?: string | null;
  sumupMapping?: string | null;
  priceCents?: number | null;
  manufacturer?: { id: string; slug: string } | null;
  rangeRef?: {
    id?: string;
    slug?: string;
    manufacturerId?: string | null;
    manufacturer?: { id?: string; slug?: string } | null;
  } | null;
};

export type ZeroMixCheck = {
  ok: boolean;
  reasons: string[];
};

export function checkProductZeroMix(p: ZeroMixProductInput): ZeroMixCheck {
  const reasons: string[] = [];

  if (!p.isActive) reasons.push("inactive");
  if (!p.visibleOnline) reasons.push("not_visible");
  if (p.catalogStatus && !["valide", "actif"].includes(p.catalogStatus)) {
    reasons.push("catalog_status");
  }
  if (!p.manufacturerId && !p.manufacturer?.id) {
    reasons.push("manufacturer_missing");
  }
  if (!p.rangeId && !p.rangeRef?.id) {
    reasons.push("range_id_missing");
  }

  const productMfr = p.manufacturerId || p.manufacturer?.id || null;
  const rangeMfr = p.rangeRef?.manufacturerId || p.rangeRef?.manufacturer?.id || null;
  if (productMfr && rangeMfr && productMfr !== rangeMfr) {
    reasons.push("mix_product_range_manufacturer");
  }

  if (p.imageUrl && isGroupPhotoUrl(p.imageUrl)) {
    reasons.push("group_photo");
  }

  if (
    isEliquideProduct({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
    })
  ) {
    // Déjà en ligne : ne pas re-bloquer l'affichage gamme pour photo/prix/sumup.
    // Le gate publication reste pour la mise en ligne initiale.
    if (p.visibleOnline !== true) {
      const gate = evaluateEliquidePublishGate({
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
        name: p.name,
        sumupName: p.sumupName,
        sumupProductId: p.sumupProductId,
        imageStatus: p.imageStatus,
        imageUrl: p.imageUrl,
        priceCents: p.priceCents,
        sumupMapping: p.sumupMapping,
        nameProvenance: parseNameProvenance(p.sumupMapping),
      });
      if (!gate.canPublishOnline) {
        reasons.push(...gate.reasons.map((r) => `gate:${r}`));
      }
    }
  } else {
    // Non e-liquide : image média minimale si visible
    if (
      p.visibleOnline &&
      (!p.imageUrl || !String(p.imageUrl).startsWith("/media/"))
    ) {
      reasons.push("media_image_missing");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function filterProductsZeroMix<T extends ZeroMixProductInput>(
  products: T[],
): { ok: T[]; rejected: Array<{ product: T; reasons: string[] }> } {
  const ok: T[] = [];
  const rejected: Array<{ product: T; reasons: string[] }> = [];
  for (const p of products) {
    const check = checkProductZeroMix(p);
    if (check.ok) ok.push(p);
    else rejected.push({ product: p, reasons: check.reasons });
  }
  return { ok, rejected };
}
