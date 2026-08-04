import type { PriceSource } from "@/lib/inventory/status";
import { computeLineTotalCents } from "@/lib/inventory/pricing";

export type LineLike = {
  quantityCounted: number;
  unitPriceCents?: number | null;
  totalValueCents?: number | null;
  productId?: string | null;
  productNameSnapshot?: string | null;
  photoPath?: string | null;
  photos?: Array<{ id: string }> | null;
  priceSource?: string | null;
};

export type SessionSummary = {
  referenceCount: number;
  totalQuantity: number;
  totalValueCents: number;
  missingPriceCount: number;
  unknownProductCount: number;
  photoCount: number;
};

export function summarizeInventoryLines(lines: LineLike[]): SessionSummary {
  let totalQuantity = 0;
  let totalValue = 0;
  let missingPriceCount = 0;
  let unknownProductCount = 0;
  let photoCount = 0;

  for (const line of lines) {
    totalQuantity += line.quantityCounted || 0;
    const unit = line.unitPriceCents;
    if (unit == null) {
      missingPriceCount += 1;
    } else {
      const lineTotal =
        line.totalValueCents ??
        computeLineTotalCents(line.quantityCounted, unit) ??
        0;
      totalValue += lineTotal;
    }
    if (!line.productId) unknownProductCount += 1;
    const fromRelation = line.photos?.length ?? 0;
    photoCount += fromRelation > 0 ? fromRelation : line.photoPath ? 1 : 0;
  }

  return {
    referenceCount: lines.length,
    totalQuantity,
    totalValueCents: totalValue,
    missingPriceCount,
    unknownProductCount,
    photoCount,
  };
}

export function resolveCatalogUnitPriceCents(product: {
  priceCents: number;
  promoPriceCents?: number | null;
  source?: string | null;
}): { cents: number; source: PriceSource } {
  const cents =
    product.promoPriceCents != null && product.promoPriceCents > 0
      ? product.promoPriceCents
      : product.priceCents;
  const source: PriceSource =
    product.source === "sumup" || product.source === "SUMUP" ? "SUMUP" : "CATALOGUE";
  return { cents, source };
}
