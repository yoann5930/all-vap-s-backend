import type { DeliveryMethod } from "@prisma/client";

export type ReadyFulfillment = "pickup" | "shipping" | "none";

export function fulfillmentFromDeliveryMethod(
  method: DeliveryMethod | string | null | undefined,
): ReadyFulfillment {
  if (method === "STORE_PICKUP") return "pickup";
  if (
    method === "MONDIAL_RELAY" ||
    method === "RELAIS_COLIS" ||
    method === "CHRONOPOST" ||
    method === "COLISSIMO"
  ) {
    return "shipping";
  }
  return "none";
}

export function nextActionLabel(
  method: DeliveryMethod | string | null | undefined,
): string {
  const kind = fulfillmentFromDeliveryMethod(method);
  if (kind === "pickup") return "prévenir le client";
  if (method === "MONDIAL_RELAY") return "préparer l'expédition Mondial Relay";
  if (method === "RELAIS_COLIS") return "préparer l'expédition Relais Colis";
  if (method === "CHRONOPOST") return "préparer l'expédition Chronopost";
  if (kind === "shipping") return "préparer l'expédition";
  return "analyser le mode de livraison";
}

export function carrierLabel(method: DeliveryMethod | string | null | undefined): string | null {
  switch (method) {
    case "MONDIAL_RELAY":
      return "Mondial Relay";
    case "RELAIS_COLIS":
      return "Relais Colis";
    case "CHRONOPOST":
      return "Chronopost";
    case "COLISSIMO":
      return "Colissimo";
    case "STORE_PICKUP":
      return "Retrait magasin";
    default:
      return null;
  }
}
