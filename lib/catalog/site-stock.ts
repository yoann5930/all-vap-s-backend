import type { StockStatus } from "@/lib/catalog/stock";

/** Statuts affichés site / admin — stock global = somme des boutiques */
export function siteStockLabel(status: StockStatus): string {
  switch (status) {
    case "EN_STOCK":
      return "En stock";
    case "STOCK_FAIBLE":
      return "Stock faible";
    case "RUPTURE":
      return "Rupture de stock";
    case "INCONNU":
      return "Stock en cours de lecture";
    case "SYNCHRONISATION_EN_ERREUR":
      return "Stock en cours de lecture";
    default:
      return "Stock en cours de lecture";
  }
}

export function siteStockBadgeClass(status: StockStatus): string {
  switch (status) {
    case "EN_STOCK":
      return "text-emerald-600";
    case "STOCK_FAIBLE":
      return "text-amber-600";
    case "RUPTURE":
      return "text-red-600";
    default:
      return "text-gray-500";
  }
}
