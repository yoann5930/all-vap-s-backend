/**
 * Prix inventaire — saisie euros → centimes, validations métier.
 */

const MAX_PRICE_CENTS_SOFT = 50_000; // 500 € — confirmation demandée au-delà
const MAX_PRICE_CENTS_HARD = 500_000; // 5 000 € — refusé

export type ParsedPrice =
  | { ok: true; cents: number; needsHighConfirm: boolean }
  | { ok: false; error: string };

/** Accepte "6,90", "6.90", "6,90 €", "19.90€" */
export function parseEuroPriceInput(raw: string | number | null | undefined): ParsedPrice {
  if (raw === null || raw === undefined) {
    return { ok: false, error: "Prix requis" };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "Prix invalide" };
    return fromEuros(raw);
  }
  const cleaned = String(raw)
    .trim()
    .replace(/\s/g, "")
    .replace(/€/gi, "")
    .replace(",", ".");
  if (!cleaned) return { ok: false, error: "Prix manquant" };
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Format prix invalide (ex. 6,90)" };
  }
  const euros = Number(cleaned);
  if (!Number.isFinite(euros)) return { ok: false, error: "Prix invalide" };
  return fromEuros(euros);
}

function fromEuros(euros: number): ParsedPrice {
  if (euros < 0) return { ok: false, error: "Le prix ne peut pas être négatif" };
  const cents = Math.round(euros * 100);
  if (cents > MAX_PRICE_CENTS_HARD) {
    return { ok: false, error: "Montant trop élevé (max 5000 €)" };
  }
  return {
    ok: true,
    cents,
    needsHighConfirm: cents > MAX_PRICE_CENTS_SOFT,
  };
}

export function formatEuroFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function computeLineTotalCents(
  quantity: number,
  unitPriceCents: number | null | undefined
): number | null {
  if (unitPriceCents == null || !Number.isFinite(unitPriceCents)) return null;
  if (!Number.isFinite(quantity)) return null;
  return Math.round(quantity * unitPriceCents);
}

export type PriceValidationOptions = {
  /** Autoriser 0 € uniquement si true */
  allowZero: boolean;
  /** Confirmation montant élevé déjà obtenue */
  confirmHighAmount?: boolean;
};

export function assertValidUnitPriceCents(
  cents: number,
  options: PriceValidationOptions
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(cents)) {
    return { ok: false, error: "Le prix doit avoir au plus 2 décimales" };
  }
  if (cents < 0) return { ok: false, error: "Le prix ne peut pas être négatif" };
  if (cents === 0 && !options.allowZero) {
    return { ok: false, error: "Confirmez explicitement un prix à 0 €" };
  }
  if (cents > MAX_PRICE_CENTS_HARD) {
    return { ok: false, error: "Montant trop élevé (max 5000 €)" };
  }
  if (cents > MAX_PRICE_CENTS_SOFT && !options.confirmHighAmount) {
    return {
      ok: false,
      error: "Montant élevé — confirmation requise (plus de 500 €)",
    };
  }
  return { ok: true };
}
