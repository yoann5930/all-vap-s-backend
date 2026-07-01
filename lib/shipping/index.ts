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

// Provider stubs — ready for API integration
export const shippingProviders = {
  mondialRelay: {
    id: "mondial-relay" as const,
    isConfigured: () => !!process.env.MONDIAL_RELAY_API_KEY,
    createLabel: async (_orderId: string) => ({ trackingNumber: "MR-PENDING" }),
  },
  relaisColis: {
    id: "relais-colis" as const,
    isConfigured: () => !!process.env.RELAIS_COLIS_API_KEY,
    createLabel: async (_orderId: string) => ({ trackingNumber: "RC-PENDING" }),
  },
  colissimo: {
    id: "colissimo" as const,
    isConfigured: () => !!process.env.COLISSIMO_API_KEY,
    createLabel: async (_orderId: string) => ({ trackingNumber: "COL-PENDING" }),
  },
};
