/**
 * Conditionnement résistances / réservoirs — stock toujours en unités.
 * Affichage : fullBoxes × unitsPerBox + looseUnits = totalUnits
 */

export const UNITS_PER_BOX_ALLOWED = [1, 2, 3, 4, 5] as const;
export type UnitsPerBox = (typeof UNITS_PER_BOX_ALLOWED)[number];

export function isPackagedHardwareCategory(params: {
  name?: string | null;
  category?: string | null;
  productFamily?: string | null;
  taxonomyGroup?: string | null;
}): boolean {
  const tax = (params.taxonomyGroup || "").toUpperCase();
  if (tax === "RESISTANCES" || tax === "RESERVOIRS" || tax === "CARTOUCHES") return true;
  const blob = `${params.category || ""} ${params.productFamily || ""} ${params.name || ""}`.toLowerCase();
  return (
    /r[ée]sistance|resistances?|\bcoil\b|\bmesh\b|\bpnp\b|\bgtx\b/.test(blob) ||
    /r[ée]servoir|tank|clearomiseur|cartouche/.test(blob)
  );
}

export function normalizeUnitsPerBox(raw: unknown): UnitsPerBox | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n)) return null;
  if (!(UNITS_PER_BOX_ALLOWED as readonly number[]).includes(n)) return null;
  return n as UnitsPerBox;
}

export function computeTotalUnits(params: {
  fullBoxes: number;
  unitsPerBox: number;
  looseUnits: number;
}): number {
  const boxes = Math.max(0, Math.floor(params.fullBoxes) || 0);
  const per = Math.max(1, Math.floor(params.unitsPerBox) || 1);
  const loose = Math.max(0, Math.floor(params.looseUnits) || 0);
  return boxes * per + loose;
}

export function splitUnitsIntoBoxes(params: {
  totalUnits: number;
  unitsPerBox: number;
}): { fullBoxes: number; looseUnits: number; totalUnits: number } {
  const total = Math.max(0, Math.floor(params.totalUnits) || 0);
  const per = Math.max(1, Math.floor(params.unitsPerBox) || 1);
  return {
    fullBoxes: Math.floor(total / per),
    looseUnits: total % per,
    totalUnits: total,
  };
}

export function formatPackagedStockLabel(params: {
  totalUnits: number;
  unitsPerBox: number | null | undefined;
}): string {
  const total = Math.max(0, Math.floor(params.totalUnits) || 0);
  const per = params.unitsPerBox;
  if (per == null || per < 1) {
    return `Stock : ${total} unité${total > 1 ? "s" : ""}`;
  }
  const { fullBoxes, looseUnits } = splitUnitsIntoBoxes({
    totalUnits: total,
    unitsPerBox: per,
  });
  return `Stock : ${fullBoxes} boîte${fullBoxes > 1 ? "s" : ""} × ${per} + ${looseUnits} unité${looseUnits > 1 ? "s" : ""} = ${total} unité${total > 1 ? "s" : ""}`;
}
