/**
 * Identité documents PDF All Vap's — charte noir / blanc / or.
 * Logo officiel du site uniquement (pas de logo reinventé).
 */
import path from "path";

export const DOC_GOLD = { r: 0.78, g: 0.65, b: 0.32 };
export const DOC_BLACK = { r: 0.07, g: 0.07, b: 0.08 };
export const DOC_INK = { r: 0.12, g: 0.12, b: 0.14 };
export const DOC_MUTED = { r: 0.4, g: 0.4, b: 0.42 };
export const DOC_ROW = { r: 0.96, g: 0.95, b: 0.93 };
export const DOC_WHITE = { r: 1, g: 1, b: 1 };

export function getCompanyIdentity() {
  return {
    name: process.env.COMPANY_LEGAL_NAME?.trim() || "ALL VAP'S",
    tagline: "EXPERT DE LA VAPE",
    address:
      process.env.COMPANY_ADDRESS?.trim() ||
      "17 Avenue Marcel Aimé, 59330 Hautmont, France",
    siret: process.env.COMPANY_SIRET?.trim() || "",
    email: process.env.COMPANY_EMAIL?.trim() || "contact@allvaps.fr",
    phone: process.env.COMPANY_PHONE?.trim() || "",
    logoPath: path.join(process.cwd(), "public", "brand", "logo-official-dark.png"),
    /** Serif proche d'Algerian si Algerian absente (Windows Times Bold). */
    displayFontCandidates: [
      "C:\\Windows\\Fonts\\ALGER.TTF",
      "C:\\Windows\\Fonts\\alger.ttf",
      "C:\\Windows\\Fonts\\timesbd.ttf",
      "C:\\Windows\\Fonts\\times.ttf",
    ],
  };
}

export function paymentMethodLabel(provider: string | null | undefined): string {
  switch (provider) {
    case "VIVA":
      return "Carte bancaire";
    case "SUMUP":
      return "Carte bancaire (SumUp)";
    default:
      return provider ? `Paiement ${provider}` : "Paiement en ligne";
  }
}

export function deliveryMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case "MONDIAL_RELAY":
      return "Mondial Relay";
    case "RELAIS_COLIS":
      return "Relais Colis";
    case "STORE_PICKUP":
      return "Retrait boutique";
    case "COLISSIMO":
      return "Colissimo";
    default:
      return method || "—";
  }
}
