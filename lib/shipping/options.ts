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
  {
    id: "COLISSIMO",
    name: "Colissimo",
    description: "Livraison à domicile",
    priceCents: 590,
    estimatedDays: "1-3 jours",
    icon: "truck",
  },
  {
    id: "STORE_PICKUP",
    name: "Retrait boutique",
    description: "All Vap's Hautmont ou Le Quesnoy — Gratuit",
    priceCents: 0,
    estimatedDays: "Disponible sous 2h",
    icon: "map-pin",
  },
];

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
      return null;
  }
}

export function makeLocalTracking(prefix: string, orderId: string): string {
  const short = orderId.slice(-8).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `AV-${prefix}-${stamp}-${short}`;
}
