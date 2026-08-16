/**
 * Reco matériel débutant — catalogue réel + stock réel.
 * Jamais de caractéristique inventée. Max 1 principale + 2 alternatives.
 */
import type { AvaRankedProduct } from "@/lib/ai/ava/types";
import { toAvaProductCard } from "@/lib/ai/ava/response-builder";

export type BeginnerDevicePool = {
  products: ReturnType<typeof toAvaProductCard>[];
  primaryInStock: boolean;
  spokenLead: string;
};

function inStock(r: AvaRankedProduct): boolean {
  if (r.outOfStockExact) return false;
  const qty = r.matchedVariant ? r.matchedVariant.stock : r.product.availableQuantity;
  if (r.product.stockKnown && qty <= 0) return false;
  return qty > 0 || !r.product.stockKnown;
}

function compactHint(name: string): boolean {
  return /pod|slim|nano|mini|xros|argus g|compact/i.test(name);
}

function autonomyHint(name: string): boolean {
  return /box|kit |drag|mod |2000|3000|batterie/i.test(name);
}

function reasonFor(index: number, name: string, stockOk: boolean): string {
  if (!stockOk) return "Disponibilité à confirmer en boutique.";
  if (index === 0) {
    return "C’est celui que je vous recommande en priorité : simple à utiliser et adapté pour débuter.";
  }
  if (compactHint(name)) {
    return "Plus compact et discret, si vous préférez quelque chose de petit.";
  }
  if (autonomyHint(name)) {
    return "Plus confortable si vous voulez éviter de recharger pendant la journée.";
  }
  return "Alternative pertinente, toujours en matériel rechargeable.";
}

export function selectBeginnerDevicePool(
  ranked: AvaRankedProduct[],
  limit = 3,
): BeginnerDevicePool {
  const stocked = ranked.filter(inStock);
  const pool = (stocked.length ? stocked : ranked).slice(0, limit);
  const products = pool.map((r, i) =>
    toAvaProductCard(r, reasonFor(i, r.product.name, inStock(r))),
  );
  return {
    products,
    primaryInStock: pool[0] ? inStock(pool[0]) : false,
    spokenLead:
      products.length === 0
        ? "Je n’ai pas de matériel débutant disponible à vous montrer pour le moment."
        : "Je vous montre les modèles que je trouve les plus adaptés pour commencer simplement.",
  };
}
