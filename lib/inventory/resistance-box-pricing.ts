/**
 * Résistances inventaire — comptage par boîte + prix boîte depuis prix unitaire.
 *
 * Règles :
 * - boîte 2 ou 3 → prix = unitaire × N
 * - boîte ≥ 4 → 1 offerte → prix = unitaire × (N − 1)
 * - unitsPerPack déduit du nom (Pack de N, Npk, xN…) — jamais inventé.
 */

export function parseUnitsPerPackFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const s = String(name);

  const patterns: RegExp[] = [
    /\bpack\s*de\s*(\d{1,2})\b/i,
    /\bbo[iî]te\s*de\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*pk\b/i,
    /\b(\d{1,2})\s*pack\b/i,
    /\bx\s*(\d{1,2})\b/i,
    /\b×\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*[x×]\b/i,
    /\((\d{1,2})\s*pcs?\)/i,
    /\b(\d{1,2})\s*pi[eè]ces?\b/i,
    /\b(\d{1,2})\s*r[ée]sistances?\b/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (!m?.[1]) continue;
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 50) return n;
  }
  return null;
}

export function isResistanceProduct(params: {
  name?: string | null;
  category?: string | null;
  taxonomyGroup?: string | null;
}): boolean {
  if ((params.taxonomyGroup || "").toUpperCase() === "RESISTANCES") return true;
  const blob = `${params.category || ""} ${params.name || ""}`.toLowerCase();
  return /r[ée]sistance|resistances?|\bcoil\b|\bmesh\b|\bpnp\b|\bgtx\b|\bz\s*0\.|\bz\s*series/i.test(
    blob
  );
}

/**
 * Prix d’une boîte en centimes à partir du prix unitaire.
 * Retourne null si N invalide / manquant.
 */
export function computeResistanceBoxPriceCents(params: {
  unitPriceCents: number;
  unitsPerPack: number;
}): number | null {
  const unit = params.unitPriceCents;
  const n = params.unitsPerPack;
  if (!Number.isFinite(unit) || unit < 0) return null;
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;

  if (n === 2 || n === 3) {
    return Math.round(unit * n);
  }
  if (n >= 4) {
    // 1 résistance offerte → payer N−1
    return Math.round(unit * (n - 1));
  }
  // N === 1 : pas de boîte multi — prix = unitaire
  return Math.round(unit);
}

export function formatResistanceBoxHint(params: {
  boxes: number;
  unitsPerPack: number | null;
}): string | null {
  const n = params.unitsPerPack;
  const boxes = params.boxes;
  if (n == null || n < 1) return null;
  if (!Number.isFinite(boxes) || boxes < 0) {
    return `1 boîte = ${n} résistance${n > 1 ? "s" : ""}`;
  }
  const total = Math.round(boxes) * n;
  return `${Math.round(boxes)} boîte${Math.round(boxes) > 1 ? "s" : ""} × ${n} = ${total} résistance${total > 1 ? "s" : ""}`;
}

/**
 * Convertit un prix catalogue (souvent unitaire) en prix boîte.
 * Si le montant catalogue est déjà cohérent avec une boîte (ex. 16,40 pour N=5),
 * on le conserve.
 */
export function resolveResistanceBoxPriceCents(params: {
  catalogPriceCents: number;
  unitsPerPack: number;
}): number | null {
  const catalog = params.catalogPriceCents;
  const n = params.unitsPerPack;
  if (!Number.isFinite(catalog) || catalog < 0) return null;
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;

  const paidUnits = n >= 4 ? n - 1 : n === 1 ? 1 : n;
  if (paidUnits > 0 && catalog % paidUnits === 0) {
    const impliedUnit = catalog / paidUnits;
    // Prix unitaire plausible ~2 €–15 € → catalogue déjà au tarif boîte
    if (impliedUnit >= 200 && impliedUnit <= 1500) {
      return catalog;
    }
  }

  return computeResistanceBoxPriceCents({
    unitPriceCents: catalog,
    unitsPerPack: n,
  });
}
