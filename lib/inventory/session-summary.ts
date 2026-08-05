import type { PriceSource } from "@/lib/inventory/status";
import { computeLineTotalCents } from "@/lib/inventory/pricing";

export type LineLike = {
  quantityCounted: number;
  unitPriceCents?: number | null;
  totalValueCents?: number | null;
  productId?: string | null;
  productNameSnapshot?: string | null;
  barcode?: string | null;
  photoPath?: string | null;
  photos?: Array<{ id: string }> | null;
  priceSource?: string | null;
};

export type SessionSummary = {
  referenceCount: number;
  totalQuantity: number;
  totalValueCents: number;
  missingPriceCount: number;
  missingBarcodeCount: number;
  missingPhotoCount: number;
  unknownProductCount: number;
  photoCount: number;
  incompleteCount: number;
};

export function lineHasPhoto(line: LineLike): boolean {
  return Boolean((line.photos && line.photos.length > 0) || line.photoPath);
}

export function isLineComplete(line: LineLike): boolean {
  return Boolean(
    line.barcode &&
      String(line.barcode).trim().length >= 6 &&
      line.unitPriceCents != null &&
      line.unitPriceCents >= 0 &&
      lineHasPhoto(line)
  );
}

export function summarizeInventoryLines(lines: LineLike[]): SessionSummary {
  let totalQuantity = 0;
  let totalValue = 0;
  let missingPriceCount = 0;
  let missingBarcodeCount = 0;
  let missingPhotoCount = 0;
  let unknownProductCount = 0;
  let photoCount = 0;
  let incompleteCount = 0;

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
    if (!line.barcode || String(line.barcode).trim().length < 6) {
      missingBarcodeCount += 1;
    }
    if (!line.productId && !line.productNameSnapshot) unknownProductCount += 1;
    const fromRelation = line.photos?.length ?? 0;
    const hasPhoto = fromRelation > 0 || Boolean(line.photoPath);
    photoCount += hasPhoto ? 1 : 0;
    if (!hasPhoto) missingPhotoCount += 1;
    if (!isLineComplete(line)) incompleteCount += 1;
  }

  return {
    referenceCount: lines.length,
    totalQuantity,
    totalValueCents: totalValue,
    missingPriceCount,
    missingBarcodeCount,
    missingPhotoCount,
    unknownProductCount,
    photoCount,
    incompleteCount,
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
