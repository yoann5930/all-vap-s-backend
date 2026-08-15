/**
 * Offre dégressive E-Tasty One Taste 10 ml — panier / checkout.
 *
 * Prix catalogue / SumUp inchangé (6,90 €). Aucune écriture SumUp.
 * Toutes saveurs One Taste 10 ml se cumulent (1 pool).
 *
 * Paliers (quantité payante dans le panier) :
 *  1 → 6,90 €/u
 *  2 → 5,90 €/u
 *  3 → 4,90 €/u
 *  4 → 3,90 €/u
 *  5 → 4,90 €/u + 1 offert (5+1, livré en plus)
 *  6 → 4,90 €/u + 2 offerts
 *  7 → 4,90 €/u + 3 offerts
 *  8 → 4,90 €/u + 4 offerts
 *  9 → 4,90 €/u + 5 offerts
 * 10 → 4,90 €/u + 6 offerts (10+6)
 *
 * Au-delà de 10 : packs de 10 (4,90 € + 6 offerts) + palier du reste.
 * JAMAIS : Twenty 20 ml, 50 / 100 ml, autres marques, DIY, matériel.
 */

export const PROMO_10ML_LABEL = "Offre One Taste 10 ml";
export const TEN_ML_CATALOG_UNIT_CENTS = 690;
export const TEN_ML_PACK_UNIT_CENTS = 490;
export const TEN_ML_PACK_FREE_EXTRA = 6;

export const TEN_ML_TIERS = [
  { qty: 1, unitCents: 690, freeExtra: 0 },
  { qty: 2, unitCents: 590, freeExtra: 0 },
  { qty: 3, unitCents: 490, freeExtra: 0 },
  { qty: 4, unitCents: 390, freeExtra: 0 },
  { qty: 5, unitCents: 490, freeExtra: 1 },
  { qty: 6, unitCents: 490, freeExtra: 2 },
  { qty: 7, unitCents: 490, freeExtra: 3 },
  { qty: 8, unitCents: 490, freeExtra: 4 },
  { qty: 9, unitCents: 490, freeExtra: 5 },
  { qty: 10, unitCents: 490, freeExtra: 6 },
] as const;

export type TenMlTier = (typeof TEN_ML_TIERS)[number];

export interface Promo10mlEligibleInput {
  name?: string | null;
  brand?: string | null;
  range?: string | null;
  rangeSlug?: string | null;
  productFamily?: string | null;
  category?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  promotion10mlEligible?: boolean | null;
  visibleOnline?: boolean | null;
  isActive?: boolean | null;
  catalogStatus?: string | null;
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
  brand?: string | null;
  range?: string | null;
  rangeSlug?: string | null;
  productFamily?: string | null;
  availableQuantity?: number | null;
}

export interface Promo10mlFreeExtra {
  productId: string;
  variantId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Promo10mlQuote {
  paidQuantity: number;
  unitCents: number | null;
  freeExtra: number;
  payCents: number;
  label: string | null;
}

export interface Promo10mlResult {
  eligibleQuantity: number;
  ignoredQuantity: number;
  unitCents: number | null;
  /** Flacons offerts à livrer EN PLUS du panier. */
  freeExtra: number;
  /** Alias de freeExtra (affichage historique). */
  freeQuantity: number;
  catalogSubtotalCents: number;
  payCents: number;
  discountCents: number;
  extras: Promo10mlFreeExtra[];
  unfulfilledFreeExtra: number;
  freeUnits: Array<{
    productId: string;
    variantId?: string | null;
    name: string;
    unitPriceCents: number;
  }>;
  label: string | null;
  quoteLabel: string | null;
  reasonExcludedSample: string[];
  avaSummary: string;
}

function normOfferKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHardwareCategory(category?: string | null, categoryName?: string | null): boolean {
  const t = `${category || ""} ${categoryName || ""}`.toLowerCase();
  if (!t.trim()) return false;
  return (
    /cigarette|e-?cig|pod|r[eé]sistance|accessoire|diy|base\b|booster|matériel|materiel|kit\b|mod\b|atomiseur/.test(
      t
    ) && !/e-?liquide|eliquide/.test(t)
  );
}

function isEliquideCategory(category?: string | null, categoryName?: string | null): boolean {
  const t = `${category || ""} ${categoryName || ""}`.toLowerCase();
  if (!t.trim()) return false;
  if (isHardwareCategory(category, categoryName)) return false;
  return /e-?liquide|eliquide|05\.e-liquide|06\.e-liquide|09\.e-liquide/.test(t);
}

/** Identité gamme One Taste — jamais un 10 ml d'une autre marque / autre gamme. */
export function looksLikeOneTaste(input: Promo10mlEligibleInput): boolean {
  if ((input.productFamily || "").toUpperCase() === "ETASTY_ONE_TASTE") return true;
  const slug = normOfferKey(input.rangeSlug || "").replace(/_/g, "-");
  if (slug === "one-taste" || slug === "onetaste") return true;
  if (/one\s*taste/i.test(input.range || "")) return true;
  if (/one\s*taste/i.test(input.name || "")) return true;
  return false;
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
 * E-Tasty One Taste 10 ml publié. Jamais Twenty, 50/100 ml, autre marque.
 * Le flag admin n'est plus bloquant (il n'était jamais posé en production).
 */
export function isPromo10mlEligible(input: Promo10mlEligibleInput): boolean {
  if (!looksLikeOneTaste(input)) return false;

  const volumeMl = resolveVolumeMl(input);
  if (volumeMl != null && volumeMl !== 10) return false;

  const pt = (input.productType || "").toLowerCase();
  if (
    /\b50\s*ml\b|\b100\s*ml\b|\b20\s*ml\b|50ml|100ml|20ml/.test(pt) &&
    !/\b10\s*ml\b|10ml/.test(pt)
  ) {
    return false;
  }

  const strong =
    (input.productFamily || "").toUpperCase() === "ETASTY_ONE_TASTE" ||
    normOfferKey(input.rangeSlug || "").replace(/_/g, "-") === "one-taste" ||
    /one\s*taste/i.test(input.range || "");
  if (!strong && volumeMl !== 10 && !/\b10\s*ml\b|10ml/i.test(pt)) {
    return false;
  }
  if (volumeMl !== 10 && !/\b10\s*ml\b|10ml/i.test(pt) && !/\b10\s*ml\b/i.test(input.name || "")) {
    return false;
  }

  if (isHardwareCategory(input.category, input.categoryName)) return false;
  if (
    (input.category || input.categoryName) &&
    !isEliquideCategory(input.category, input.categoryName) &&
    !strong
  ) {
    return false;
  }

  if (input.isActive === false) return false;
  if (input.visibleOnline === false) return false;
  if (input.catalogStatus && !["valide", "actif"].includes(input.catalogStatus)) {
    return false;
  }

  const qty = input.availableQuantity ?? input.stock;
  if (typeof qty === "number" && qty <= 0) return false;

  return true;
}

export function whyNotPromo10mlEligible(input: Promo10mlEligibleInput): string | null {
  if (!looksLikeOneTaste(input)) return "pas_one_taste";
  const volumeMl = resolveVolumeMl(input);
  if (volumeMl != null && volumeMl !== 10) return `volumeMl=${volumeMl} (requis: 10)`;
  if (isHardwareCategory(input.category, input.categoryName)) {
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

export function quoteTenMlPaidQuantity(paidQty: number): Promo10mlQuote {
  if (!Number.isFinite(paidQty) || paidQty <= 0) {
    return { paidQuantity: 0, unitCents: null, freeExtra: 0, payCents: 0, label: null };
  }

  const packs = Math.floor(paidQty / 10);
  const rem = paidQty % 10;
  let payCents = packs * 10 * TEN_ML_PACK_UNIT_CENTS;
  let freeExtra = packs * TEN_ML_PACK_FREE_EXTRA;
  let unitCents: number | null = packs > 0 ? TEN_ML_PACK_UNIT_CENTS : null;

  if (rem > 0) {
    const tier = TEN_ML_TIERS[rem - 1];
    payCents += rem * tier.unitCents;
    freeExtra += tier.freeExtra;
    unitCents = packs > 0 ? TEN_ML_PACK_UNIT_CENTS : tier.unitCents;
  }

  const label =
    freeExtra > 0
      ? `${PROMO_10ML_LABEL} — ${paidQty} × ${formatTenMlUnitEuro(unitCents!)} + ${freeExtra} offert${freeExtra > 1 ? "s" : ""}`
      : `${PROMO_10ML_LABEL} — ${paidQty} × ${formatTenMlUnitEuro(unitCents!)}`;

  return {
    paidQuantity: paidQty,
    unitCents,
    freeExtra,
    payCents,
    label,
  };
}

export function formatTenMlUnitEuro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export function tenMlTiersForDisplay(): Array<{
  qty: number;
  unitLabel: string;
  extraLabel: string;
}> {
  return TEN_ML_TIERS.map((t) => ({
    qty: t.qty,
    unitLabel: formatTenMlUnitEuro(t.unitCents),
    extraLabel:
      t.freeExtra > 0
        ? `+ ${t.freeExtra} offert${t.freeExtra > 1 ? "s" : ""}`
        : "—",
  }));
}

export function allocateTenMlFreeExtras(
  eligibleLines: Promo10mlCartLine[],
  freeExtra: number
): { extras: Promo10mlFreeExtra[]; unfulfilled: number } {
  if (freeExtra <= 0) return { extras: [], unfulfilled: 0 };

  const sorted = [...eligibleLines]
    .filter((l) => l.quantity > 0 && l.productId)
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

  let leftover = freeExtra;
  const extras: Promo10mlFreeExtra[] = [];

  for (const line of sorted) {
    if (leftover <= 0) break;
    const known = line.availableQuantity;
    const remaining =
      typeof known === "number" && Number.isFinite(known)
        ? Math.max(0, known - line.quantity)
        : leftover;
    const take = Math.min(leftover, remaining);
    if (take <= 0) continue;
    extras.push({
      productId: line.productId,
      variantId: line.variantId,
      name: line.name,
      quantity: take,
      unitPriceCents: 0,
    });
    leftover -= take;
  }

  if (leftover > 0 && sorted[0]) {
    const first = extras.find(
      (e) =>
        e.productId === sorted[0].productId &&
        (e.variantId || "") === (sorted[0].variantId || "")
    );
    if (first) first.quantity += leftover;
    else {
      extras.push({
        productId: sorted[0].productId,
        variantId: sorted[0].variantId,
        name: sorted[0].name,
        quantity: leftover,
        unitPriceCents: 0,
      });
    }
    leftover = 0;
  }

  return { extras, unfulfilled: leftover };
}

function buildAvaSummary(params: {
  eligibleQuantity: number;
  unitCents: number | null;
  freeExtra: number;
  payCents: number;
  discountCents: number;
}): string {
  if (params.eligibleQuantity <= 0) {
    return "A.V.A. : aucun E-Tasty One Taste 10 ml dans ce panier — offre dégressive non applicable.";
  }
  const unit = params.unitCents != null ? formatTenMlUnitEuro(params.unitCents) : "—";
  const extra =
    params.freeExtra > 0
      ? ` Vous recevez ${params.freeExtra} flacon${params.freeExtra > 1 ? "s" : ""} One Taste 10 ml offert${params.freeExtra > 1 ? "s" : ""} en plus.`
      : "";
  const disc =
    params.discountCents > 0
      ? ` Remise ${formatTenMlUnitEuro(params.discountCents)} sur le tarif catalogue.`
      : "";
  return `A.V.A. a vérifié l'offre One Taste 10 ml avant paiement : ${params.eligibleQuantity} flacon${params.eligibleQuantity > 1 ? "s" : ""} à ${unit} l'unité (${formatTenMlUnitEuro(params.payCents)}).${extra}${disc} Prix catalogue inchangé. Uniquement la gamme e.Tasty One Taste 10 ml.`;
}

export function calculatePromo10ml(lines: Promo10mlCartLine[]): Promo10mlResult {
  const reasonExcludedSample: string[] = [];
  const eligible: Promo10mlCartLine[] = [];
  let ignoredQuantity = 0;

  for (const line of lines) {
    const eligibleInput = {
      name: line.name,
      brand: line.brand,
      range: line.range,
      rangeSlug: line.rangeSlug,
      productFamily: line.productFamily,
      category: line.category,
      productType: line.productType,
      volumeMl: line.volumeMl,
      promotion10mlEligible: line.promotion10mlEligible,
      availableQuantity: line.availableQuantity ?? line.quantity,
      visibleOnline: true,
      isActive: true,
      catalogStatus: "valide",
    };
    const eligibleFlag = isPromo10mlEligible(eligibleInput);

    if (!eligibleFlag) {
      ignoredQuantity += line.quantity;
      const why = whyNotPromo10mlEligible(eligibleInput);
      if (why && reasonExcludedSample.length < 8) {
        reasonExcludedSample.push(`${line.name}: ${why}`);
      }
      continue;
    }

    if (line.unitPriceCents <= 0 || line.quantity <= 0) {
      ignoredQuantity += line.quantity;
      reasonExcludedSample.push(`${line.name}: prix_invalide`);
      continue;
    }
    eligible.push(line);
  }

  const eligibleQuantity = eligible.reduce((s, l) => s + l.quantity, 0);
  const catalogSubtotalCents = eligible.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const quote = quoteTenMlPaidQuantity(eligibleQuantity);
  const payCents = Math.min(quote.payCents, catalogSubtotalCents);
  const discountCents = Math.max(0, catalogSubtotalCents - payCents);
  const { extras, unfulfilled } = allocateTenMlFreeExtras(eligible, quote.freeExtra);

  const freeUnits = extras.flatMap((e) =>
    Array.from({ length: e.quantity }, () => ({
      productId: e.productId,
      variantId: e.variantId,
      name: e.name,
      unitPriceCents: 0,
    }))
  );

  return {
    eligibleQuantity,
    ignoredQuantity,
    unitCents: quote.unitCents,
    freeExtra: quote.freeExtra,
    freeQuantity: quote.freeExtra,
    catalogSubtotalCents,
    payCents,
    discountCents,
    extras,
    unfulfilledFreeExtra: unfulfilled,
    freeUnits,
    label: eligibleQuantity > 0 ? quote.label : null,
    quoteLabel: quote.label,
    reasonExcludedSample,
    avaSummary: buildAvaSummary({
      eligibleQuantity,
      unitCents: quote.unitCents,
      freeExtra: quote.freeExtra,
      payCents,
      discountCents,
    }),
  };
}

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

export function tenMlOfferFaqAnswer(): string {
  const lines = TEN_ML_TIERS.map((t) => {
    const extra =
      t.freeExtra > 0
        ? ` + ${t.freeExtra} flacon${t.freeExtra > 1 ? "s" : ""} offert${t.freeExtra > 1 ? "s" : ""} (livré en plus)`
        : "";
    return `${t.qty} = ${formatTenMlUnitEuro(t.unitCents)} / unité${extra}`;
  });
  return [
    "Offre dégressive E-Tasty One Taste 10 ml chez All Vap's. Le prix affiché catalogue reste 6,90 € ; la remise se calcule au panier, toutes saveurs One Taste 10 ml cumulées.",
    ...lines,
    "Au-delà de 10 : packs de 10 (4,90 € / unité + 6 offerts) + palier du reste.",
    "Uniquement la gamme e.Tasty One Taste 10 ml — jamais Twenty 20 ml, 50 / 100 ml, ni une autre marque. Je vérifie cette offre sur le panier avant paiement.",
  ].join("\n");
}
