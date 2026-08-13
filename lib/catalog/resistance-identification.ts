/**
 * Identification résistances (ohm) pour inventaire.
 * Module requis par app/api/inventaire/sessions/[id]/lines/route.ts.
 *
 * Implémentation minimale sûre : normalise les ohms saisis, n'invente pas
 * d'identité, n'applique pas de conflit bloquant tant qu'aucune identité
 * structurée n'est disponible. Ne modifie pas le catalogue public / A.V.A.
 */

import { parseUnitsPerPackFromName } from "@/lib/inventory/resistance-box-pricing";

export const OHM_VALUE_CONFLICT = "OHM_VALUE_CONFLICT";

export type ResistanceIdentity = {
  manufacturer: string | null;
  coilFamily: string | null;
  technicalReference: string | null;
  resistanceValueOhm: number | null;
  resistanceValueDisplay: string | null;
  coilTechnology: string | null;
  unitsPerPack: number | null;
  powerRangeMinW: number | null;
  powerRangeMaxW: number | null;
};

export type ResistanceAssociationDecision = {
  allowed: boolean;
  code?: string;
  reason?: string;
  message?: string;
  identityKey?: string;
  compared?: { a: string; b: string };
};

/** Parse / normalise une valeur ohm saisie (ex. "0.6", "0,6 Ω"). */
export function normalizeResistanceOhmValue(
  raw: string | number | null | undefined
): { value: number; display: string } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const value = Math.round(raw * 1000) / 1000;
    return { value, display: `${value} Ω` };
  }
  const cleaned = String(raw)
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, " ")
    .trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value * 1000) / 1000;
  return { value: rounded, display: `${rounded} Ω` };
}

/**
 * Extrait une identité résistance depuis une ligne inventaire.
 * unitsPerPack : uniquement si le nom valide N (Pack de N / Npk…), jamais inventé.
 */
export function parseResistanceIdentityFromLine(_input: {
  notes?: string | null;
  formatSnapshot?: string | null;
  brandSnapshot?: string | null;
  rangeSnapshot?: string | null;
  productNameSnapshot?: string | null;
}): ResistanceIdentity {
  const fromNotes = normalizeResistanceOhmValue(_input.notes);
  const fromFormat = normalizeResistanceOhmValue(_input.formatSnapshot);
  const ohm = fromNotes ?? fromFormat;
  const unitsPerPack =
    parseUnitsPerPackFromName(_input.productNameSnapshot) ??
    parseUnitsPerPackFromName(_input.notes);
  return {
    manufacturer: null,
    coilFamily: null,
    technicalReference: null,
    resistanceValueOhm: ohm?.value ?? null,
    resistanceValueDisplay: ohm?.display ?? null,
    coilTechnology: null,
    unitsPerPack,
    powerRangeMinW: null,
    powerRangeMaxW: null,
  };
}

/**
 * Association résistances : autorise sauf écart ohm net entre deux valeurs connues.
 */
export function evaluateResistanceAssociation(
  a: ResistanceIdentity | null | undefined,
  b: ResistanceIdentity | null | undefined
): ResistanceAssociationDecision {
  const av = a?.resistanceValueOhm ?? null;
  const bv = b?.resistanceValueOhm ?? null;
  if (av == null || bv == null) {
    return {
      allowed: true,
      reason: "MISSING_VALUE",
      identityKey: "partial",
      compared: { a: String(av), b: String(bv) },
    };
  }
  const delta = Math.abs(av - bv);
  // Tolérance 0.05 Ω — au-delà = conflit (comportement attendu inventaire)
  if (delta > 0.05) {
    return {
      allowed: false,
      code: OHM_VALUE_CONFLICT,
      reason: "OHM_MISMATCH",
      message: `Valeurs ohm incompatibles : ${av} Ω vs ${bv} Ω`,
      compared: { a: `${av}`, b: `${bv}` },
    };
  }
  return {
    allowed: true,
    reason: "OHM_COMPATIBLE",
    identityKey: `${av}`,
    compared: { a: `${av}`, b: `${bv}` },
  };
}
