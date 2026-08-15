/**
 * Emplacement inventaire : stock boutique vs vitrine.
 * Vitrine = 1 unité max (quantityCounted toujours en unités, jamais en boîtes).
 * Stock = aucune limite de quantité, une seule ligne stock par produit.
 *
 * Par produit (même barcode / productId, rien d’inventé) :
 * - vitrine + vitrine = interdit
 * - stock + stock = interdit
 * - vitrine + stock = autorisé
 */
export const INVENTORY_PLACEMENTS = ["STOCK", "VITRINE"] as const;
export type InventoryPlacement = (typeof INVENTORY_PLACEMENTS)[number];

export function normalizeInventoryPlacement(
  value: unknown
): InventoryPlacement {
  const v = String(value || "")
    .trim()
    .toUpperCase();
  if (v === "VITRINE") return "VITRINE";
  return "STOCK";
}

export function validateInventoryPlacementQuantity(params: {
  placement: InventoryPlacement;
  quantityCounted: number;
}): { ok: true } | { ok: false; error: string; code: string } {
  if (params.placement === "VITRINE" && params.quantityCounted > 1) {
    return {
      ok: false,
      error:
        "Vitrine : un seul produit autorisé (quantité max = 1). Passez en Stock pour compter plus.",
      code: "VITRINE_QTY_LIMIT",
    };
  }
  return { ok: true };
}

/** Même emplacement = doublon. Vitrine + stock du même produit = OK. */
export function isSamePlacementDuplicate(
  existing: InventoryPlacement,
  incoming: InventoryPlacement
): boolean {
  return existing === incoming;
}

export function placementLabel(placement: InventoryPlacement): string {
  return placement === "VITRINE" ? "Vitrine" : "Stock";
}
