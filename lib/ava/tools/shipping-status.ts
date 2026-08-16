import {
  ChronopostCarrier,
  MondialRelayCarrier,
  RelaisColisCarrier,
} from "@/lib/shipping/carrier-service";
import { isCarrierConfigured } from "@/lib/shipping/carriers";
import { isDemoMode, isRealShippingAllowed } from "@/lib/shipping/real-shipping-guard";
import { avaLog } from "@/lib/ava/logging";

export type ShippingProviderId = "MONDIAL_RELAY" | "RELAIS_COLIS" | "CHRONOPOST";

export type ShippingProvider = {
  id: ShippingProviderId;
  isAvailable(): boolean;
  mode(): "DEMO" | "NOT_CONFIGURED" | "AVAILABLE";
  spoken(): string;
};

function modeFor(id: "mondial-relay" | "relais-colis" | "chronopost"): ShippingProvider["mode"] {
  if (isDemoMode() || !isRealShippingAllowed()) {
    return isCarrierConfigured(id) ? "DEMO" : "NOT_CONFIGURED";
  }
  return isCarrierConfigured(id) ? "AVAILABLE" : "NOT_CONFIGURED";
}

export const AvaShippingProviders: Record<ShippingProviderId, ShippingProvider> = {
  MONDIAL_RELAY: {
    id: "MONDIAL_RELAY",
    isAvailable: () => MondialRelayCarrier.id === "mondial-relay",
    mode: () => modeFor("mondial-relay"),
    spoken() {
      const m = this.mode();
      if (m === "NOT_CONFIGURED") return "Mondial Relay : non configuré.";
      if (m === "DEMO") return "Mondial Relay : disponible en mode démonstration, aucun paiement réel.";
      return "Mondial Relay : disponible.";
    },
  },
  RELAIS_COLIS: {
    id: "RELAIS_COLIS",
    isAvailable: () => RelaisColisCarrier.id === "relais-colis",
    mode: () => modeFor("relais-colis"),
    spoken() {
      const m = this.mode();
      if (m === "NOT_CONFIGURED") return "Relais Colis : non configuré.";
      if (m === "DEMO") return "Relais Colis : mode démonstration.";
      return "Relais Colis : disponible.";
    },
  },
  CHRONOPOST: {
    id: "CHRONOPOST",
    isAvailable: () => ChronopostCarrier.id === "chronopost",
    mode: () => modeFor("chronopost"),
    spoken() {
      const m = this.mode();
      if (m === "NOT_CONFIGURED") return "Chronopost : non configuré.";
      if (m === "DEMO") return "Chronopost : mode démonstration, aucun achat d'étiquette.";
      return "Chronopost : disponible.";
    },
  },
};

export function speakAvaShipping(correlationId: string): { ok: true; spoken: string } {
  const spoken = [
    AvaShippingProviders.MONDIAL_RELAY.spoken(),
    AvaShippingProviders.RELAIS_COLIS.spoken(),
    AvaShippingProviders.CHRONOPOST.spoken(),
  ].join(" ");
  avaLog("SHIP", correlationId, "shipping_status");
  return { ok: true, spoken };
}
