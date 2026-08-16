import type { DeliveryMethod } from "@prisma/client";

export interface ShippingOption {
  id: DeliveryMethod;
  name: string;
  description: string;
  priceCents: number;
  estimatedDays: string;
  icon: string;
}

export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: "MONDIAL_RELAY",
    name: "Mondial Relay",
    description: "Point relais près de chez vous",
    priceCents: 390,
    estimatedDays: "2-4 jours",
    icon: "package",
  },
  {
    id: "RELAIS_COLIS",
    name: "Relais Colis",
    description: "Retrait en commerçant partenaire",
    priceCents: 390,
    estimatedDays: "2-4 jours",
    icon: "store",
  },
  // La Poste / Colissimo : EXCLUS — aucun développement ni offre en ligne.
  {
    id: "STORE_PICKUP",
    name: "Retrait boutique",
    description: "All Vap's Hautmont ou Le Quesnoy — Gratuit",
    priceCents: 0,
    estimatedDays: "Disponible sous 2h",
    icon: "map-pin",
  },
];

/** Options proposées au checkout (La Poste exclue). */
export function getPublicShippingOptions(): ShippingOption[] {
  return SHIPPING_OPTIONS.filter((o) => o.id !== "COLISSIMO");
}

export function getShippingOption(method: DeliveryMethod): ShippingOption | undefined {
  return SHIPPING_OPTIONS.find((o) => o.id === method);
}

export function getShippingPrice(method: DeliveryMethod): number {
  return getShippingOption(method)?.priceCents ?? 0;
}

export function getTrackingUrl(
  method: DeliveryMethod | null | undefined,
  trackingNumber: string | null | undefined
): string | null {
  if (!trackingNumber) return null;
  switch (method) {
    case "MONDIAL_RELAY":
      return `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(trackingNumber)}`;
    case "RELAIS_COLIS":
      return `https://www.relaiscolis.com/suivi-de-colis/?tracking=${encodeURIComponent(trackingNumber)}`;
    case "COLISSIMO":
      return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(trackingNumber)}`;
    default:
      if (String(method) === "CHRONOPOST") {
        return `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumeros=${encodeURIComponent(trackingNumber)}`;
      }
      return null;
  }
}

/**
 * @deprecated Ne plus inventer de numéros de suivi. Conservé pour compat lecture ancienne data.
 */
export function makeLocalTracking(prefix: string, orderId: string): string {
  const short = orderId.slice(-8).toUpperCase();
  return `AV-LEGACY-${prefix}-${short}`;
}
