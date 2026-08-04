import type { StockStatus } from "@/lib/catalog/stock";

/** Statuts affichés site / admin — stock global = somme des boutiques */
export function siteStockLabel(status: StockStatus): string {
  switch (status) {
    case "EN_STOCK":
      return "En stock";
    case "STOCK_FAIBLE":
      return "Stock faible";
    case "RUPTURE":
      return "Rupture";
    case "INCONNU":
      return "Disponibilité à confirmer";
    case "SYNCHRONISATION_EN_ERREUR":
      return "Synchronisation en erreur";
    default:
      return "Disponibilité à confirmer";
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
