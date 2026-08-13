/**
 * Gardes d’identité produit — empêche fusion auto 50≠100 ml / nicotine différente.
 * Utilisé par matching catalogue + lookup inventaire (jamais de fusion silencieuse).
 */
import {
  parseNicotineMgFromText,
  parseVolumeMlFromText,
} from "@/lib/inventory/barcode-alias-suggest";

export function volumesConflict(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null || b == null) return false;
  return Number(a) !== Number(b);
}

export function nicotineConflict(
  sourceMg: number | null | undefined,
  candidateMgs: Array<number | null | undefined> | number | null | undefined
): boolean {
  if (sourceMg == null) return false;
  const list = Array.isArray(candidateMgs)
    ? candidateMgs.filter((n): n is number => n != null && Number.isFinite(n))
    : candidateMgs != null && Number.isFinite(candidateMgs)
      ? [candidateMgs]
      : [];
  if (!list.length) {
    // Pas de nicotine côté candidat : tenter le nom
    return false;
  }
  return !list.some((n) => Math.abs(n - sourceMg) < 0.05);
}

/**
 * true = liaison auto par nom autorisée.
 * false = volumes ou nicotine discriminants incompatibles.
 */
export function canAutoLinkByName(params: {
  sourceName: string;
  sourceVolumeMl?: number | null;
  sourceNicotineMg?: number | null;
  candidate: {
    name: string;
    volumeMl?: number | null;
    nicotineMgs?: Array<number | null | undefined>;
  };
}): boolean {
  const srcVol =
    params.sourceVolumeMl ?? parseVolumeMlFromText(params.sourceName) ?? null;
  const candVol =
    params.candidate.volumeMl ??
    parseVolumeMlFromText(params.candidate.name) ??
    null;
  if (volumesConflict(srcVol, candVol)) return false;

  const srcNic =
    params.sourceNicotineMg ??
    parseNicotineMgFromText(params.sourceName) ??
    null;
  const fromVariants = params.candidate.nicotineMgs || [];
  const candNicFromName = parseNicotineMgFromText(params.candidate.name);
  const candNics =
    fromVariants.length > 0
      ? fromVariants
      : candNicFromName != null
        ? [candNicFromName]
        : [];
  if (nicotineConflict(srcNic, candNics)) return false;

  return true;
}
