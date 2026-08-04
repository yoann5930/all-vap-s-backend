/**
 * Extensions demo pour double stock + inventaire.
 * Stock Hautmont = stock produit demo ; Le Quesnoy = 0 (import ultérieur).
 */
import type { DemoStore } from "./seed-data";

const BASE = new Date("2024-06-01T10:00:00.000Z");

export const LOC_HAUTMONT = "loc_hautmont";
export const LOC_LE_QUESNOY = "loc_le_quesnoy";
export const LOC_GLOBAL_LEGACY = "loc_global_all_vaps";

export function buildDualStockSeed(products: Array<Record<string, unknown>>) {
  const stockLocations = [
    {
      id: LOC_HAUTMONT,
      code: "HAUTMONT",
      name: "All Vap's Hautmont",
      address: "17 Avenue Marcel Aimé, 59330 Hautmont",
      active: true,
      createdAt: BASE,
      updatedAt: BASE,
    },
    {
      id: LOC_LE_QUESNOY,
      code: "LE_QUESNOY",
      name: "All Vap's Le Quesnoy",
      address: "10 Rue Léon Gambetta, 59530 Le Quesnoy",
      active: true,
      createdAt: BASE,
      updatedAt: BASE,
    },
    {
      id: LOC_GLOBAL_LEGACY,
      code: "GLOBAL_ALL_VAPS",
      name: "Stock général All Vap's (legacy)",
      address: null,
      active: false,
      createdAt: BASE,
      updatedAt: BASE,
    },
  ];

  const productVariants: Array<Record<string, unknown>> = [];
  const stockLevels: Array<Record<string, unknown>> = [];
  const stockMovements: Array<Record<string, unknown>> = [];

  for (const p of products) {
    const productId = String(p.id);
    const qty = Number(p.stock || 0);
    const variantId = `var_${productId}`;
    productVariants.push({
      id: variantId,
      productId,
      name: "Standard",
      sku: p.sku || null,
      barcode: p.barcode || null,
      active: true,
      createdAt: BASE,
      updatedAt: BASE,
    });

    // Hautmont = stock demo ; Le Quesnoy = 0 (sera importé plus tard)
    stockLevels.push({
      id: `sl_h_${productId}`,
      productId,
      variantId,
      locationId: LOC_HAUTMONT,
      quantity: qty,
      reservedQuantity: 0,
      availableQuantity: qty,
      lowStockThreshold: 3,
      source: "demo_seed",
      lastSyncedAt: BASE,
      createdAt: BASE,
      updatedAt: BASE,
    });
    stockLevels.push({
      id: `sl_q_${productId}`,
      productId,
      variantId,
      locationId: LOC_LE_QUESNOY,
      quantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      lowStockThreshold: 3,
      source: "demo_seed",
      lastSyncedAt: null,
      createdAt: BASE,
      updatedAt: BASE,
    });

    if (qty > 0) {
      stockMovements.push({
        id: `sm_seed_${productId}`,
        productId,
        variantId,
        locationId: LOC_HAUTMONT,
        movementType: "IMPORT",
        quantityBefore: 0,
        quantityChange: qty,
        quantityAfter: qty,
        source: "demo_seed",
        externalReference: `demo:seed:${productId}`,
        createdAt: BASE,
      });
    }
  }

  return {
    stockLocations,
    productVariants,
    stockLevels,
    stockMovements,
    inventorySessions: [] as Array<Record<string, unknown>>,
    inventoryLines: [] as Array<Record<string, unknown>>,
    syncRuns: [] as Array<Record<string, unknown>>,
    productMatches: [] as Array<Record<string, unknown>>,
    syncErrors: [] as Array<Record<string, unknown>>,
  };
}

export type DualStockCollections = ReturnType<typeof buildDualStockSeed>;

export function attachDualStockToStore(
  store: DemoStore & DualStockCollections,
  products: Array<Record<string, unknown>>
) {
  const dual = buildDualStockSeed(products);
  Object.assign(store, dual);
  return store;
}
