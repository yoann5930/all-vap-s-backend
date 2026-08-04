/** Statuts inventaire (DB) ↔ libellés admin FR */

export const INVENTORY_STATUSES = [
  "OPEN",
  "COMPLETED",
  "VALIDATED",
  "CORRECTED",
  "CANCELLED",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  OPEN: "EN COURS",
  COMPLETED: "TERMINÉ",
  VALIDATED: "VALIDÉ",
  CORRECTED: "CORRIGÉ",
  CANCELLED: "ANNULÉ",
};

export function isInventoryStatus(value: string): value is InventoryStatus {
  return (INVENTORY_STATUSES as readonly string[]).includes(value);
}

export function statusLabel(status: string): string {
  if (isInventoryStatus(status)) return INVENTORY_STATUS_LABELS[status];
  return status;
}

export const PRICE_SOURCES = [
  "CATALOGUE",
  "SUMUP",
  "SAISIE_MANUELLE",
  "CORRECTION_ADMIN",
] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  CATALOGUE: "Catalogue",
  SUMUP: "SumUp",
  SAISIE_MANUELLE: "Saisie manuelle",
  CORRECTION_ADMIN: "Correction admin",
};
