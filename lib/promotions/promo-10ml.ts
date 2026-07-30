/**
 * Offre dégressive e-liquides 10 ml UNIQUEMENT.
 *
 * Éligibilité STRICTE (toutes conditions requises) :
 * - category = e-liquide
 * - volumeMl = 10
 * - promotion10mlEligible = true
 * - variante / produit publié et disponible
 *
 * JAMAIS : 50 ml, 100 ml, e-cigs, pods, résistances, accessoires, DIY, autres.
 * Aucune modification de prix SumUp — remise calculée côté panier uniquement.
 */

/** Palier 5+1 : pour chaque groupe de 6 unités éligibles, 1 offerte (la moins chère). */
export const PROMO_10ML_GROUP_SIZE = 6;
export const PROMO_10ML_FREE_PER_GROUP = 1;
export const PROMO_10ML_LABEL = "Offre 10 ml — 5+1";

export interface Promo10mlEligibleInput {
  category?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  promotion10mlEligible?: boolean | null;
  visibleOnline?: boolean | null;
  isActive?: boolean | null;
  catalogStatus?: string | null;
  /** Stock disponible de la ligne (variante ou produit) */
  availableQuantity?: number | null;
  stock?: number | null;
}

export interface Promo10mlCartLine {
  productId: string;
  variantId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  category?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  promotion10mlEligible?: boolean | null;
  availableQuantity?: number | null;
}

export interface Promo10mlResult {
  eligibleQuantity: number;
  ignoredQuantity: number;
  freeQuantity: number;
  discountCents: number;
  /** Indices / lignes contribuant aux unités offertes (pour affichage) */
  freeUnits: Array<{
    productId: string;
    variantId?: string | null;
    name: string;
    unitPriceCents: number;
  }>;
  label: string | null;
  /** Détail debug / admin */
  reasonExcludedSample: string[];
}

function isEliquideCategory(category?: string | null, categoryName?: string | null): boolean {
  const t = `${category || ""} ${categoryName || ""}`.toLowerCase();
  if (!t.trim()) return false;
  // Exclusions explicites hors e-liquide
  if (
    /cigarette|e-?cig|pod|r[eé]sistance|accessoire|diy|base\b|booster|matériel|materiel|kit\b|mod\b|atomiseur/.test(
      t
    ) &&
    !/e-?liquide|eliquide/.test(t)
  ) {
    return false;
  }
  return /e-?liquide|eliquide|05\.e-liquide|06\.e-liquide|09\.e-liquide/.test(t);
}

function resolveVolumeMl(input: Promo10mlEligibleInput): number | null {
  if (typeof input.volumeMl === "number" && Number.isFinite(input.volumeMl)) {
    return input.volumeMl;
  }
  const pt = (input.productType || "").toLowerCase();
  const m = pt.match(/^(\d+)\s*ml$/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Règle d'éligibilité unique — utilisée panier, checkout, admin, badges, tests.
 */
export function isPromo10mlEligible(input: Promo10mlEligibleInput): boolean {
  if (input.promotion10mlEligible !== true) return false;

  const volumeMl = resolveVolumeMl(input);
  if (volumeMl !== 10) return false;

  // Filet de sécurité : jamais 50 / 100 / 20 même si volumeMl mal renseigné
  const pt = (input.productType || "").toLowerCase();
  if (
    /\b50\s*ml\b|\b100\s*ml\b|\b20\s*ml\b|50ml|100ml|20ml/.test(pt) &&
    !/\b10\s*ml\b|10ml/.test(pt)
  ) {
    return false;
  }

  if (!isEliquideCategory(input.category, input.categoryName)) return false;

  if (input.isActive === false) return false;
  if (input.visibleOnline === false) return false;
  if (
    input.catalogStatus &&
    !["valide", "actif"].includes(input.catalogStatus)
  ) {
    return false;
  }

  const qty = input.availableQuantity ?? input.stock;
  if (typeof qty === "number" && qty <= 0) return false;

  return true;
}

export function whyNotPromo10mlEligible(input: Promo10mlEligibleInput): string | null {
  if (input.promotion10mlEligible !== true) return "promotion10mlEligible=false";
  const volumeMl = resolveVolumeMl(input);
  if (volumeMl !== 10) return `volumeMl=${volumeMl ?? "null"} (requis: 10)`;
  if (!isEliquideCategory(input.category, input.categoryName)) {
    return `category_non_eliquide:${input.category || input.categoryName || ""}`;
  }
  if (input.isActive === false) return "inactif";
  if (input.visibleOnline === false) return "non_publie";
  if (input.catalogStatus && !["valide", "actif"].includes(input.catalogStatus)) {
    return `catalogStatus=${input.catalogStatus}`;
  }
  const qty = input.availableQuantity ?? input.stock;
  if (typeof qty === "number" && qty <= 0) return "rupture";
  return null;
}

/**
 * Calcule la remise 5+1 sur les seules lignes éligibles 10 ml.
 * Les 50/100 ml et le reste du panier sont totalement ignorés pour le palier.
 */
export function calculatePromo10ml(lines: Promo10mlCartLine[]): Promo10mlResult {
  const reasonExcludedSample: string[] = [];
  const eligibleUnits: Array<{
    productId: string;
    variantId?: string | null;
    name: string;
    unitPriceCents: number;
  }> = [];

  let ignoredQuantity = 0;

  for (const line of lines) {
    const eligible = isPromo10mlEligible({
      category: line.category,
      productType: line.productType,
      volumeMl: line.volumeMl,
      promotion10mlEligible: line.promotion10mlEligible,
      availableQuantity: line.availableQuantity ?? line.quantity,
      visibleOnline: true,
      isActive: true,
      catalogStatus: "valide",
    });

    if (!eligible) {
      ignoredQuantity += line.quantity;
      const why = whyNotPromo10mlEligible({
        category: line.category,
        productType: line.productType,
        volumeMl: line.volumeMl,
        promotion10mlEligible: line.promotion10mlEligible,
        availableQuantity: line.availableQuantity ?? line.quantity,
        visibleOnline: true,
        isActive: true,
        catalogStatus: "valide",
      });
      if (why && reasonExcludedSample.length < 8) {
        reasonExcludedSample.push(`${line.name}: ${why}`);
      }
      continue;
    }

    if (line.unitPriceCents <= 0) {
      ignoredQuantity += line.quantity;
      reasonExcludedSample.push(`${line.name}: prix_invalide`);
      continue;
    }

    for (let i = 0; i < line.quantity; i++) {
      eligibleUnits.push({
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
        unitPriceCents: line.unitPriceCents,
      });
    }
  }

  const eligibleQuantity = eligibleUnits.length;
  const freeQuantity =
    Math.floor(eligibleQuantity / PROMO_10ML_GROUP_SIZE) * PROMO_10ML_FREE_PER_GROUP;

  // Offrir les unités les moins chères
  const sorted = [...eligibleUnits].sort((a, b) => a.unitPriceCents - b.unitPriceCents);
  const freeUnits = sorted.slice(0, freeQuantity);
  const discountCents = freeUnits.reduce((s, u) => s + u.unitPriceCents, 0);

  return {
    eligibleQuantity,
    ignoredQuantity,
    freeQuantity,
    discountCents,
    freeUnits,
    label: freeQuantity > 0 ? PROMO_10ML_LABEL : null,
    reasonExcludedSample,
  };
}

/** Prix panier après remise 10 ml (ne touche pas SumUp). */
export function applyPromo10mlToSubtotal(
  subtotalCents: number,
  lines: Promo10mlCartLine[]
): { subtotalCents: number; discountCents: number; totalCents: number; promo: Promo10mlResult } {
  const promo = calculatePromo10ml(lines);
  const discountCents = Math.min(promo.discountCents, Math.max(0, subtotalCents));
  return {
    subtotalCents,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    promo,
  };
}
