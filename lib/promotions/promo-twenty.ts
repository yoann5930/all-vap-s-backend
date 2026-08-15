/**
 * Offre dégressive Twenty (e.Tasty, 20 ml) — panier / checkout uniquement.
 *
 * Le prix catalogue / SumUp reste 12,90 €. Aucune écriture SumUp.
 * Les saveurs Twenty se cumulent (1 pool).
 *
 * Paliers (quantité payante dans le panier) :
 *  1 → 12,90 €/u
 *  2 → 11,90 €/u
 *  3 → 10,90 €/u
 *  4 →  9,90 €/u
 *  5 →  7,90 €/u
 *  6 →  8,90 €/u + 1 offert (livré en plus)
 *  7 →  8,90 €/u + 2 offerts
 *  8 →  8,90 €/u + 3 offerts
 *  9 →  8,90 €/u + 4 offerts
 * 10 →  8,90 €/u + 5 offerts
 *
 * Au-delà de 10 : packs de 10 (8,90 € + 5 offerts) + palier du reste.
 * Les flacons offerts s’ajoutent à la quantité panier (ex. 6 payés → 7 livrés).
 */

export const TWENTY_PROMO_LABEL = "Offre Twenty dégressive";
export const TWENTY_CATALOG_UNIT_CENTS = 1290;

export const TWENTY_TIERS = [
  { qty: 1, unitCents: 1290, freeExtra: 0 },
  { qty: 2, unitCents: 1190, freeExtra: 0 },
  { qty: 3, unitCents: 1090, freeExtra: 0 },
  { qty: 4, unitCents: 990, freeExtra: 0 },
  { qty: 5, unitCents: 790, freeExtra: 0 },
  { qty: 6, unitCents: 890, freeExtra: 1 },
  { qty: 7, unitCents: 890, freeExtra: 2 },
  { qty: 8, unitCents: 890, freeExtra: 3 },
  { qty: 9, unitCents: 890, freeExtra: 4 },
  { qty: 10, unitCents: 890, freeExtra: 5 },
] as const;

export type TwentyTier = (typeof TWENTY_TIERS)[number];

export interface PromoTwentyEligibleInput {
  name?: string | null;
  brand?: string | null;
  range?: string | null;
  rangeSlug?: string | null;
  productFamily?: string | null;
  category?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  visibleOnline?: boolean | null;
  isActive?: boolean | null;
  catalogStatus?: string | null;
  availableQuantity?: number | null;
  stock?: number | null;
}

export interface PromoTwentyCartLine {
  productId: string;
  variantId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  category?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  brand?: string | null;
  range?: string | null;
  rangeSlug?: string | null;
  productFamily?: string | null;
  availableQuantity?: number | null;
}

export interface PromoTwentyFreeExtra {
  productId: string;
  variantId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PromoTwentyQuote {
  paidQuantity: number;
  unitCents: number | null;
  freeExtra: number;
  payCents: number;
  label: string | null;
}

export interface PromoTwentyResult {
  eligibleQuantity: number;
  ignoredQuantity: number;
  /** Unité facturée (prix palier). */
  unitCents: number | null;
  /** Flacons offerts à livrer EN PLUS du panier. */
  freeExtra: number;
  catalogSubtotalCents: number;
  payCents: number;
  discountCents: number;
  label: string | null;
  quoteLabel: string | null;
  extras: PromoTwentyFreeExtra[];
  unfulfilledFreeExtra: number;
  reasonExcludedSample: string[];
  avaSummary: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveVolumeMl(input: PromoTwentyEligibleInput): number | null {
  if (typeof input.volumeMl === "number" && Number.isFinite(input.volumeMl)) {
    return input.volumeMl;
  }
  const pt = (input.productType || "").toLowerCase();
  const m = pt.match(/^(\d+)\s*ml$/);
  if (m) return Number(m[1]);
  return null;
}

function looksLikeTwenty(input: PromoTwentyEligibleInput): boolean {
  if ((input.productFamily || "").toUpperCase() === "ETASTY_TWENTY") return true;
  if (norm(input.rangeSlug || "") === "twenty") return true;
  if (/\btwenty\b/i.test(input.range || "")) return true;
  if (/\btwenty\b/i.test(input.name || "")) return true;
  return false;
}

/**
 * Éligibilité unique — panier, checkout, badges, AVA, tests.
 * Jamais 10 / 50 / 100 ml. Jamais la promo 10 ml.
 */
export function isPromoTwentyEligible(input: PromoTwentyEligibleInput): boolean {
  if (!looksLikeTwenty(input)) return false;

  const volumeMl = resolveVolumeMl(input);
  if (volumeMl != null && volumeMl !== 20) return false;

  const pt = (input.productType || "").toLowerCase();
  if (/\b(10|50|100)\s*ml\b|(^|[^0-9])(10|50|100)ml/.test(pt) && !/\b20\s*ml\b|20ml/.test(pt)) {
    return false;
  }

  // Nom seul sans volume ni famille : trop ambigu
  const strong =
    (input.productFamily || "").toUpperCase() === "ETASTY_TWENTY" ||
    norm(input.rangeSlug || "") === "twenty" ||
    /\btwenty\b/i.test(input.range || "");
  if (!strong && volumeMl !== 20 && !/\b20\s*ml\b|20ml/i.test(pt)) {
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

export function whyNotPromoTwentyEligible(input: PromoTwentyEligibleInput): string | null {
  if (!looksLikeTwenty(input)) return "pas_twenty";
  const volumeMl = resolveVolumeMl(input);
  if (volumeMl != null && volumeMl !== 20) return `volumeMl=${volumeMl} (requis: 20)`;
  if (input.isActive === false) return "inactif";
  if (input.visibleOnline === false) return "non_publie";
  if (input.catalogStatus && !["valide", "actif"].includes(input.catalogStatus)) {
    return `catalogStatus=${input.catalogStatus}`;
  }
  const qty = input.availableQuantity ?? input.stock;
  if (typeof qty === "number" && qty <= 0) return "rupture";
  return null;
}

export function quoteTwentyPaidQuantity(paidQty: number): PromoTwentyQuote {
  if (!Number.isFinite(paidQty) || paidQty <= 0) {
    return { paidQuantity: 0, unitCents: null, freeExtra: 0, payCents: 0, label: null };
  }

  const packs = Math.floor(paidQty / 10);
  const rem = paidQty % 10;
  let payCents = packs * 10 * 890;
  let freeExtra = packs * 5;
  let unitCents: number | null = packs > 0 ? 890 : null;

  if (rem > 0) {
    const tier = TWENTY_TIERS[rem - 1];
    payCents += rem * tier.unitCents;
    freeExtra += tier.freeExtra;
    unitCents = packs > 0 ? 890 : tier.unitCents;
  }

  const label =
    freeExtra > 0
      ? `${TWENTY_PROMO_LABEL} — ${paidQty} × ${(unitCents! / 100).toFixed(2).replace(".", ",")} € + ${freeExtra} offert${freeExtra > 1 ? "s" : ""}`
      : `${TWENTY_PROMO_LABEL} — ${paidQty} × ${(unitCents! / 100).toFixed(2).replace(".", ",")} €`;

  return {
    paidQuantity: paidQty,
    unitCents,
    freeExtra,
    payCents,
    label,
  };
}

export function formatTwentyUnitEuro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

export function twentyTiersForDisplay(): Array<{
  qty: number;
  unitLabel: string;
  extraLabel: string;
}> {
  return TWENTY_TIERS.map((t) => ({
    qty: t.qty,
    unitLabel: formatTwentyUnitEuro(t.unitCents),
    extraLabel:
      t.freeExtra > 0
        ? `+ ${t.freeExtra} offert${t.freeExtra > 1 ? "s" : ""}`
        : "—",
  }));
}

/**
 * Attribue les flacons offerts aux lignes Twenty du panier (moins chères d’abord),
 * sans dépasser le stock restant connu.
 */
export function allocateTwentyFreeExtras(
  eligibleLines: PromoTwentyCartLine[],
  freeExtra: number
): { extras: PromoTwentyFreeExtra[]; unfulfilled: number } {
  if (freeExtra <= 0) return { extras: [], unfulfilled: 0 };

  const sorted = [...eligibleLines]
    .filter((l) => l.quantity > 0 && l.productId)
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

  let leftover = freeExtra;
  const extras: PromoTwentyFreeExtra[] = [];

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
    const first = extras.find((e) => e.productId === sorted[0].productId && (e.variantId || "") === (sorted[0].variantId || ""));
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
    return "A.V.A. : aucun Twenty 20 ml dans ce panier — offre dégressive non applicable.";
  }
  const unit = params.unitCents != null ? formatTwentyUnitEuro(params.unitCents) : "—";
  const extra =
    params.freeExtra > 0
      ? ` Vous recevez ${params.freeExtra} flacon${params.freeExtra > 1 ? "s" : ""} Twenty offert${params.freeExtra > 1 ? "s" : ""} en plus.`
      : "";
  const disc =
    params.discountCents > 0
      ? ` Remise ${formatTwentyUnitEuro(params.discountCents)} sur le tarif unitaire 12,90 €.`
      : "";
  return `A.V.A. a vérifié l'offre Twenty avant paiement : ${params.eligibleQuantity} flacon${params.eligibleQuantity > 1 ? "s" : ""} à ${unit} l'unité (${formatTwentyUnitEuro(params.payCents)}).${extra}${disc} Prix catalogue inchangé (12,90 €).`;
}

export function calculatePromoTwenty(lines: PromoTwentyCartLine[]): PromoTwentyResult {
  const reasonExcludedSample: string[] = [];
  const eligible: PromoTwentyCartLine[] = [];
  let ignoredQuantity = 0;

  for (const line of lines) {
    const eligibleFlag = isPromoTwentyEligible({
      name: line.name,
      brand: line.brand,
      range: line.range,
      rangeSlug: line.rangeSlug,
      productFamily: line.productFamily,
      category: line.category,
      productType: line.productType,
      volumeMl: line.volumeMl,
      availableQuantity: line.availableQuantity ?? line.quantity,
      visibleOnline: true,
      isActive: true,
      catalogStatus: "valide",
    });

    if (!eligibleFlag) {
      ignoredQuantity += line.quantity;
      const why = whyNotPromoTwentyEligible({
        name: line.name,
        brand: line.brand,
        range: line.range,
        rangeSlug: line.rangeSlug,
        productFamily: line.productFamily,
        category: line.category,
        productType: line.productType,
        volumeMl: line.volumeMl,
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

    if (line.unitPriceCents <= 0 || line.quantity <= 0) {
      ignoredQuantity += line.quantity;
      continue;
    }
    eligible.push(line);
  }

  const eligibleQuantity = eligible.reduce((s, l) => s + l.quantity, 0);
  const catalogSubtotalCents = eligible.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const quote = quoteTwentyPaidQuantity(eligibleQuantity);

  const rawPay = quote.payCents;
  const payCents = Math.min(rawPay, catalogSubtotalCents);
  const discountCents = Math.max(0, catalogSubtotalCents - payCents);

  const { extras, unfulfilled } = allocateTwentyFreeExtras(eligible, quote.freeExtra);

  const avaSummary = buildAvaSummary({
    eligibleQuantity,
    unitCents: quote.unitCents,
    freeExtra: quote.freeExtra,
    payCents,
    discountCents,
  });

  return {
    eligibleQuantity,
    ignoredQuantity,
    unitCents: quote.unitCents,
    freeExtra: quote.freeExtra,
    catalogSubtotalCents,
    payCents,
    discountCents,
    label: eligibleQuantity > 0 ? quote.label : null,
    quoteLabel: quote.label,
    extras,
    unfulfilledFreeExtra: unfulfilled,
    reasonExcludedSample,
    avaSummary,
  };
}

export function applyPromoTwentyToSubtotal(
  subtotalCents: number,
  lines: PromoTwentyCartLine[]
): {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  promo: PromoTwentyResult;
} {
  const promo = calculatePromoTwenty(lines);
  const discountCents = Math.min(promo.discountCents, Math.max(0, subtotalCents));
  return {
    subtotalCents,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    promo,
  };
}

export function twentyCartMeta(product: {
  brand?: string | null;
  range?: string | null;
  rangeRef?: { slug?: string | null; name?: string | null } | null;
  productFamily?: string | null;
}): {
  brand: string | null;
  range: string | null;
  rangeSlug: string | null;
  productFamily: string | null;
} {
  const rangeName = product.rangeRef?.name ?? product.range ?? null;
  const rangeSlug =
    product.rangeRef?.slug ??
    (rangeName && /\btwenty\b/i.test(rangeName)
      ? "twenty"
      : rangeName && /one\s*taste/i.test(rangeName)
        ? "one-taste"
        : null);
  return {
    brand: product.brand ?? null,
    range: rangeName,
    rangeSlug,
    productFamily: product.productFamily ?? null,
  };
}

export function twentyOfferFaqAnswer(): string {
  const lines = TWENTY_TIERS.map((t) => {
    const extra =
      t.freeExtra > 0
        ? ` + ${t.freeExtra} flacon${t.freeExtra > 1 ? "s" : ""} offert${t.freeExtra > 1 ? "s" : ""} (livré en plus)`
        : "";
    return `${t.qty} Twenty = ${formatTwentyUnitEuro(t.unitCents)} / unité${extra}`;
  });
  return [
    "Offre dégressive Twenty (e.Tasty, 20 ml) — All Vap's. Le prix affiché catalogue reste 12,90 € ; la remise se calcule au panier, toutes saveurs Twenty cumulées.",
    ...lines,
    "Au-delà de 10 : packs de 10 (8,90 € / unité + 5 offerts) + palier du reste.",
    "Je vérifie cette offre sur le panier avant paiement. Ce n'est pas l'offre 10 ml dégressive.",
  ].join("\n");
}
