/**
 * Abstraction transporteurs — jamais de SUCCESS sans preuve.
 */
import {
  createCarrierShipment,
  deliveryMethodToCarrier,
  fetchCarrierTracking,
  isCarrierConfigured,
  type CarrierId,
  type CarrierShipmentRequest,
  type CarrierShipmentResult,
} from "@/lib/shipping/carriers";

export type ShipmentStatusCode =
  | "NOT_CONFIGURED"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE"
  | "REAL_CHARGE_CONFIRMATION_REQUIRED"
  | "STORE_PICKUP"
  | "OK";

export type ShippingCarrierService = {
  id: CarrierId | "chronopost" | "store-pickup";
  validateShipmentData(req: CarrierShipmentRequest): { ok: boolean; missing: string[] };
  createShipment(req: CarrierShipmentRequest): Promise<CarrierShipmentResult & { code: ShipmentStatusCode }>;
  getTracking(trackingNumber: string): Promise<{ code: ShipmentStatusCode; trackingNumber: string; message: string }>;
};

function missingFields(req: CarrierShipmentRequest): string[] {
  const missing: string[] = [];
  if (!req.orderId) missing.push("orderId");
  if (!req.recipientName) missing.push("recipientName");
  if (!req.recipientEmail) missing.push("recipientEmail");
  return missing;
}

function wrap(
  id: CarrierId,
  create: typeof createCarrierShipment,
): ShippingCarrierService {
  return {
    id,
    validateShipmentData(req) {
      const missing = missingFields(req);
      if (id !== "colissimo" && !req.relayId && id !== "chronopost" as never) {
        /* point relais optionnel tant que non saisi */
      }
      return { ok: missing.length === 0, missing };
    },
    async createShipment(req) {
      const result = await create(id, req);
      const code: ShipmentStatusCode = result.ok
        ? "OK"
        : result.configured
          ? "UNAVAILABLE"
          : "NOT_CONFIGURED";
      return { ...result, code };
    },
    async getTracking(trackingNumber) {
      const result = await fetchCarrierTracking(id, trackingNumber);
      return {
        code: result.ok ? "OK" : result.configured ? "UNAVAILABLE" : "NOT_CONFIGURED",
        trackingNumber,
        message: result.message,
      };
    },
  };
}

export const MondialRelayCarrier = wrap("mondial-relay", createCarrierShipment);
export const RelaisColisCarrier = wrap("relais-colis", createCarrierShipment);
export const ChronopostCarrier = wrap("chronopost", createCarrierShipment);

export const StorePickupCarrier: ShippingCarrierService = {
  id: "store-pickup",
  validateShipmentData(req) {
    return { ok: Boolean(req.orderId), missing: req.orderId ? [] : ["orderId"] };
  },
  async createShipment() {
    return {
      ok: false,
      carrier: "mondial-relay",
      configured: true,
      message: "Retrait magasin : aucun bon transporteur.",
      code: "STORE_PICKUP",
    };
  },
  async getTracking(trackingNumber) {
    return {
      code: "STORE_PICKUP",
      trackingNumber,
      message: "Retrait magasin — pas de tracking transporteur.",
    };
  },
};

export function carrierServiceForDeliveryMethod(
  method: string | null | undefined,
): ShippingCarrierService | null {
  if (method === "STORE_PICKUP") return StorePickupCarrier;
  if (method === "CHRONOPOST") return ChronopostCarrier;
  const id = deliveryMethodToCarrier(method);
  if (id === "mondial-relay") return MondialRelayCarrier;
  if (id === "relais-colis") return RelaisColisCarrier;
  if (id === "chronopost") return ChronopostCarrier;
  return null;
}

export { isCarrierConfigured };
