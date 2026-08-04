/**
 * Préparation connexion ventes SumUp → stock boutique.
 * Sans boutique précisée : défaut Hautmont (documenté).
 * Pas de fausse clé ; pas d'API catalogue inventée.
 * Idempotence via externalReference sur StockMovement.
 */
import { applyStoreSale } from "@/lib/catalog/stock";
import type { StoreStockCode } from "@/lib/catalog/normalize";

export interface SumUpSaleLine {
  productId: string | null;
  quantity: number;
  externalReference: string;
  rawItemName?: string;
  locationCode?: StoreStockCode;
}

/**
 * Applique une vente SumUp sur le stock d'une boutique.
 * - produit non reconnu (productId null) → aucun mouvement
 * - même externalReference → ignoré (idempotent)
 * - jamais de stock négatif silencieux (plancher à 0)
 * - aucun remboursement auto en restock
 */
export async function applySumUpSaleToGlobalStock(lines: SumUpSaleLine[]): Promise<{
  processed: number;
  skippedUnrecognized: number;
  duplicates: number;
  errors: string[];
}> {
  let processed = 0;
  let skippedUnrecognized = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const line of lines) {
    if (!line.productId) {
      skippedUnrecognized++;
      continue;
    }
    try {
      const result = await applyStoreSale({
        productId: line.productId,
        quantity: line.quantity,
        externalReference: line.externalReference,
        source: "sumup_sale",
        locationCode: line.locationCode,
      });
      if (result.duplicate) duplicates++;
      else if (result.ok) processed++;
      else errors.push(result.message);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "erreur vente");
    }
  }

  return { processed, skippedUnrecognized, duplicates, errors };
}
