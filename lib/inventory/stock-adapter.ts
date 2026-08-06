import { getDualStockForProduct, type DualStockSnapshot } from "@/lib/catalog/stock";

/**
 * Couche lecture stock inventaire — jamais d'écriture SumUp depuis React.
 */
export interface InventoryStockAdapter {
  getStoreSnapshot(productId: string): Promise<DualStockSnapshot>;
}

export class PrismaInventoryStockAdapter implements InventoryStockAdapter {
  async getStoreSnapshot(productId: string): Promise<DualStockSnapshot> {
    return getDualStockForProduct(productId);
  }
}

/** Stub lecture seule SumUp — pas d'appel réseau dans cette version. */
export class SumUpReadOnlyInventoryAdapter implements InventoryStockAdapter {
  async getStoreSnapshot(productId: string): Promise<DualStockSnapshot> {
    return getDualStockForProduct(productId);
  }
}

export function createInventoryStockAdapter(): InventoryStockAdapter {
  return new PrismaInventoryStockAdapter();
}
