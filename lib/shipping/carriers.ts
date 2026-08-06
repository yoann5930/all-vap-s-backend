/**
 * Intégrations transporteurs — architecture sans fonctionnement inventé.
 * Mondial Relay : Dual Carrier REST (doc officielle) — branchement HTTP dès clés contrat.
 * Relais Colis : pas d'API publique étiquettes documentée → mode assisté.
 * La Poste / Colissimo : exclus.
 */

export type CarrierId = "mondial-relay" | "relais-colis" | "colissimo";

export type CarrierShipmentRequest = {
  orderId: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone?: string | null;
  addressLine: string;
  postalCode: string;
  city: string;
  country?: string;
  weightGrams?: number;
  relayId?: string | null;
};

export type CarrierShipmentResult = {
  ok: boolean;
  carrier: CarrierId;
  trackingNumber?: string;
  labelPdfBase64?: string;
  externalShipmentId?: string;
  configured: boolean;
  message: string;
};

export type CarrierTrackingResult = {
  ok: boolean;
  carrier: CarrierId;
  trackingNumber: string;
  status?: "in_transit" | "at_relay" | "delivered" | "exception" | "unknown";
  rawStatus?: string;
  configured: boolean;
  message: string;
};

function envKey(carrier: CarrierId): string {
  switch (carrier) {
    case "mondial-relay":
      return "MONDIAL_RELAY_API_KEY";
    case "relais-colis":
      return "RELAIS_COLIS_API_KEY";
    case "colissimo":
      return "COLISSIMO_API_KEY";
  }
}

export function isCarrierConfigured(carrier: CarrierId): boolean {
  if (carrier === "colissimo") return false; // La Poste exclue
  return !!(process.env[envKey(carrier)] || "").trim();
}

export async function createCarrierShipment(
  carrier: CarrierId,
  _req: CarrierShipmentRequest
): Promise<CarrierShipmentResult> {
  if (carrier === "colissimo") {
    return {
      ok: false,
      carrier,
      configured: false,
      message: "La Poste / Colissimo exclus — aucun envoi automatique.",
    };
  }

  if (!isCarrierConfigured(carrier)) {
    return {
      ok: false,
      carrier,
      configured: false,
      message:
        carrier === "mondial-relay"
          ? "API Mondial Relay Dual Carrier non configurée. Mode assisté : créer l'étiquette sur Connect puis importer le PDF."
          : "Relais Colis : pas d'API publique étiquettes configurée. Mode assisté : Easy Upload / espace pro puis import PDF.",
    };
  }

  // Credentials présents mais mapping HTTP officiel non branché — ne pas inventer de tracking.
  return {
    ok: false,
    carrier,
    configured: true,
    message:
      carrier === "mondial-relay"
        ? "Clé Mondial Relay détectée — branchez POST connect-api[-sandbox].mondialrelay.com/api/shipment (Dual Carrier). Aucun suivi inventé."
        : "Clé Relais Colis détectée — branchez l'endpoint contrat / module officiel. Aucun suivi inventé.",
  };
}

export async function fetchCarrierTracking(
  carrier: CarrierId,
  trackingNumber: string
): Promise<CarrierTrackingResult> {
  if (carrier === "colissimo") {
    return {
      ok: false,
      carrier,
      trackingNumber,
      configured: false,
      status: "unknown",
      message: "La Poste exclue.",
    };
  }
  if (!isCarrierConfigured(carrier)) {
    return {
      ok: false,
      carrier,
      trackingNumber,
      configured: false,
      status: "unknown",
      message: `Suivi auto ${carrier} indisponible (clé API manquante).`,
    };
  }
  return {
    ok: false,
    carrier,
    trackingNumber,
    configured: true,
    status: "unknown",
    message: `API suivi ${carrier} à brancher — aucun statut inventé.`,
  };
}

export function deliveryMethodToCarrier(
  method: string | null | undefined
): CarrierId | null {
  switch (method) {
    case "MONDIAL_RELAY":
      return "mondial-relay";
    case "RELAIS_COLIS":
      return "relais-colis";
    case "COLISSIMO":
      return "colissimo";
    default:
      return null;
  }
}
