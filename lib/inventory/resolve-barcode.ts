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

/**
 * Retrouve un produit catalogue pour un scan.
 * Ordre : Product.barcode → variante.barcode → sku → sumupSku.
 */
export async function resolveProductByScannedBarcode(
  raw: string
): Promise<BarcodeResolveHit | null> {
  const scanned = String(raw || "").trim();
  if (!scanned) return null;
  const ean = normalizeEan(scanned);
  const candidates = [...new Set([scanned, ean].filter(Boolean))] as string[];

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
