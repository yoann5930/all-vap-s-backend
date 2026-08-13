/**
 * Résolution code-barres inventaire → Product.
 * Ne lit / n’écrit jamais le stock.
 */
import prisma from "@/lib/prisma";
import { normalizeEan } from "@/lib/catalog/backfill-product-barcodes";

export type BarcodeResolveHit = {
  productId: string;
  matchedBy:
    | "product_barcode"
    | "product_sku"
    | "product_sumup_sku"
    | "variant_barcode";
  barcodeStored: string | null;
};

/** Variantes de chiffres pour le même code physique (UPC-A ↔ EAN-13). */
function barcodeCandidates(raw: string): string[] {
  const scanned = String(raw || "").trim();
  const ean = normalizeEan(scanned);
  const out = new Set<string>();
  if (scanned) out.add(scanned);
  if (ean) {
    out.add(ean);
    if (ean.length === 12) out.add(`0${ean}`);
    if (ean.length === 13 && ean.startsWith("0")) out.add(ean.slice(1));
  }
  return [...out];
}

/**
 * Retrouve un produit catalogue pour un scan.
 * Ordre : Product.barcode → variante.barcode → sku → sumupSku.
 */
export async function resolveProductByScannedBarcode(
  raw: string
): Promise<BarcodeResolveHit | null> {
  const candidates = barcodeCandidates(raw);
  if (!candidates.length) return null;

  const byBarcode = await prisma.product.findFirst({
    where: { barcode: { in: candidates } },
    select: { id: true, barcode: true },
  });
  if (byBarcode) {
    return {
      productId: byBarcode.id,
      matchedBy: "product_barcode",
      barcodeStored: byBarcode.barcode,
    };
  }

  const byVariant = await prisma.productVariant.findFirst({
    where: {
      active: true,
      barcode: { in: candidates },
    },
    select: { productId: true, barcode: true },
  });
  if (byVariant) {
    return {
      productId: byVariant.productId,
      matchedBy: "variant_barcode",
      barcodeStored: byVariant.barcode,
    };
  }

  const bySku = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: { in: candidates } },
        { sumupSku: { in: candidates } },
      ],
    },
    select: { id: true, barcode: true, sku: true, sumupSku: true },
  });
  if (bySku) {
    const matchedBy =
      bySku.sumupSku && candidates.includes(bySku.sumupSku)
        ? "product_sumup_sku"
        : "product_sku";
    return {
      productId: bySku.id,
      matchedBy,
      barcodeStored: bySku.barcode,
    };
  }

  return null;
}
