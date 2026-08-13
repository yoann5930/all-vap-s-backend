/**
 * Résolution code-barres inventaire → Product.
 * Ne lit / n’écrit jamais le stock.
 * Ordre : ProductBarcode → Product.barcode → variante → CatalogEanMap (CONFIRME) → sku/sumupSku.
 */
import prisma from "@/lib/prisma";
import { barcodeCandidates } from "@/lib/inventory/product-barcodes";

/** Seuls les rapprochements validés peuvent résoudre un scan via CatalogEanMap. */
export const CATALOG_EAN_MAP_TRUSTED_CONFIDENCE = ["CONFIRME"] as const;

export type BarcodeResolveHit = {
  productId: string;
  matchedBy:
    | "product_barcode_alias"
    | "product_barcode"
    | "product_sku"
    | "product_sumup_sku"
    | "variant_barcode"
    | "catalog_ean_map";
  barcodeStored: string | null;
  /** EAN réellement scanné (traçabilité packaging). */
  scannedBarcode: string;
};

/**
 * Retrouve un produit catalogue pour un scan.
 */
export async function resolveProductByScannedBarcode(
  raw: string
): Promise<BarcodeResolveHit | null> {
  const scanned = String(raw || "").trim();
  const candidates = barcodeCandidates(scanned);
  if (!candidates.length) return null;

  const byAlias = await prisma.productBarcode.findFirst({
    where: { barcode: { in: candidates } },
    select: { productId: true, barcode: true, role: true },
  });
  if (byAlias) {
    return {
      productId: byAlias.productId,
      matchedBy: "product_barcode_alias",
      barcodeStored: byAlias.barcode,
      scannedBarcode: scanned,
    };
  }

  const byBarcode = await prisma.product.findFirst({
    where: { barcode: { in: candidates } },
    select: { id: true, barcode: true },
  });
  if (byBarcode) {
    return {
      productId: byBarcode.id,
      matchedBy: "product_barcode",
      barcodeStored: byBarcode.barcode,
      scannedBarcode: scanned,
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
      scannedBarcode: scanned,
    };
  }

  // P0#3 — ignorer PROBABLE / A_VALIDER (jamais traités comme vérité scan)
  const byMap = await prisma.catalogEanMap.findFirst({
    where: {
      ean: { in: candidates },
      confidence: { in: [...CATALOG_EAN_MAP_TRUSTED_CONFIDENCE] },
    },
    select: { productId: true, ean: true, confidence: true },
  });
  if (byMap) {
    return {
      productId: byMap.productId,
      matchedBy: "catalog_ean_map",
      barcodeStored: byMap.ean,
      scannedBarcode: scanned,
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
      scannedBarcode: scanned,
    };
  }

  return null;
}
