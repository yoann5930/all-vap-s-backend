/**
 * Recherche / sections notice (sans lire tout le PDF).
 */
import type { VapeDeviceManual } from "@/lib/ava/device-types";
import { findDeviceBySlug } from "@/lib/ava/device-support";
import {
  requireDeviceConfirmed,
  type ConfirmedDeviceContext,
  type DeviceGateResult,
} from "@/lib/ava/device-confirmation";

export type ManualSection =
  | "controls"
  | "filling"
  | "coil"
  | "charging"
  | "errors"
  | "safety"
  | "cleaning";

export function resolveManualSection(
  message: string
): ManualSection | null {
  const t = message.toLowerCase();
  if (/remplir|remplissage|e-?liquide dans/.test(t)) return "filling";
  if (/résistance|resistance|coil|amorc/.test(t)) return "coil";
  if (/charge|usb|batterie faible/.test(t)) return "charging";
  if (/erreur|atomizer|short|overheat|lock/.test(t)) return "errors";
  if (/nettoyer|nettoyage|contact/.test(t)) return "cleaning";
  if (/allumer|éteindre|eteindre|verrou|watt|menu/.test(t)) return "controls";
  if (/danger|sécurité|securite|gonfl/.test(t)) return "safety";
  return null;
}

export function getManualHelp(
  ctx: ConfirmedDeviceContext | null | undefined,
  section: ManualSection
): DeviceGateResult & {
  steps?: string[];
  officialManualUrl?: string;
  device?: VapeDeviceManual;
} {
  const gate = requireDeviceConfirmed(ctx);
  if (!gate.allowed) return gate;
  const device = findDeviceBySlug(
    `${gate.context.manufacturer}-${gate.context.model}`
  );
  if (!device) {
    return {
      allowed: false,
      reason: "DEVICE_NOT_CONFIRMED",
      requiredAction: "SHOW_DEVICE_CONFIRMATION",
    };
  }

  let steps: string[] = [];
  switch (section) {
    case "filling":
      steps = device.fillingProcedure ?? [];
      break;
    case "coil":
      steps = device.coilReplacementProcedure ?? device.podReplacementProcedure ?? [];
      break;
    case "charging":
      steps = device.chargingProcedure ?? [];
      break;
    case "cleaning":
      steps = device.cleaningProcedure ?? [];
      break;
    case "controls":
      steps = Object.entries(device.controls)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`);
      break;
    case "errors":
      steps = (device.errorMessages ?? []).map(
        (e) => `${e.display} — ${e.meaning}`
      );
      break;
    case "safety":
      steps = device.safetyWarnings;
      break;
  }

  // Une étape à la fois côté UI : on renvoie tout mais le composant page
  return {
    allowed: true,
    context: gate.context,
    steps,
    officialManualUrl: device.officialManualUrl,
    device,
  };
}
