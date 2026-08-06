/**
 * Source officielle du stock All Vap's = StockLevel (emplacement GLOBAL_ALL_VAPS).
 * Toute consultation site / admin / A.V.A. / commandes doit passer par ici.
 */
import {
  getGlobalStockForProduct,
  ensureGlobalStockLocation,
  computeAvailable,
  stockStatusFromLevel,
  type GlobalStockSnapshot,
  type StockStatus,
} from "@/lib/catalog/stock";

export {
  getGlobalStockForProduct,
  ensureGlobalStockLocation,
  computeAvailable,
  stockStatusFromLevel,
};
export type { GlobalStockSnapshot, StockStatus };

/** Quantité disponible officielle (jamais négative). */
export async function getOfficialAvailableQuantity(productId: string): Promise<number> {
  const snap = await getGlobalStockForProduct(productId);
  return Math.max(0, snap.availableQuantity);
}

export function isOfficiallyInStock(snap: GlobalStockSnapshot): boolean {
  return snap.known && snap.availableQuantity > 0;
}

export function assertNonNegativeStock(qty: number): number {
  if (!Number.isFinite(qty) || qty < 0) return 0;
  return Math.floor(qty);
}
