/**
 * Préparation connexion ventes SumUp → stock général.
 * Pas de fausse clé ; pas d'API catalogue inventée.
 * Idempotence via externalReference sur StockMovement.
 */
import { applyGlobalSale } from "@/lib/catalog/stock";

export interface SumUpSaleLine {
  productId: string | null;
  quantity: number;
  externalReference: string;
  rawItemName?: string;
}

/**
 * Applique une vente SumUp sur le stock général.
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
      const result = await applyGlobalSale({
        productId: line.productId,
        quantity: line.quantity,
        externalReference: line.externalReference,
        source: "sumup_sale",
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
