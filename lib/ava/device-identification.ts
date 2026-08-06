/**
 * Identification marque / modèle + confirmation visuelle.
 */
import { searchDevices, findDeviceBySlug } from "@/lib/ava/device-support";
import type { VapeDeviceManual } from "@/lib/ava/device-types";
import { pickPhrase } from "@/lib/ava/conversation-style";
import type { ConfirmedDeviceContext } from "@/lib/ava/device-confirmation";

export type DeviceIdentificationResult = {
  status: "exact" | "candidates" | "unknown" | "needs_photo";
  candidates: VapeDeviceManual[];
  message: string;
  requireVisualConfirmation: boolean;
};

export function identifyDeviceFromText(message: string): DeviceIdentificationResult {
  const candidates = searchDevices(message, 3);
  if (candidates.length === 0) {
    return {
      status: "unknown",
      candidates: [],
      message:
        "Pas de problème. Envoyez-moi une photo de face, puis une photo du côté ou du dessous où le nom est inscrit.",
      requireVisualConfirmation: true,
    };
  }
  if (candidates.length === 1) {
    return {
      status: "exact",
      candidates,
      message: `${pickPhrase("confirm")} — ${candidates[0].manufacturer} ${candidates[0].model}`,
      requireVisualConfirmation: true,
    };
  }
  return {
    status: "candidates",
    candidates,
    message:
      "Plusieurs modèles se ressemblent. Choisissez celui qui correspond le mieux, ou ajoutez une photo.",
    requireVisualConfirmation: true,
  };
}

export function buildConfirmedContext(
  device: VapeDeviceManual,
  method: ConfirmedDeviceContext["confirmationMethod"],
  cartridge?: string
): ConfirmedDeviceContext {
  return {
    manufacturer: device.manufacturer,
    model: device.model,
    version: undefined,
    cartridge,
    confirmationMethod: method,
    confirmedAt: new Date().toISOString(),
    confidence: method === "USER_EXPLICIT_TEXT" ? 0.95 : 1,
  };
}

export function getDeviceCard(device: VapeDeviceManual) {
  return {
    manufacturer: device.manufacturer,
    model: device.model,
    modelSlug: device.modelSlug,
    imageUrl: device.images.front ?? null,
    distinguishingFeatures: device.distinguishingFeatures ?? [],
    verificationStatus: device.verificationStatus,
  };
}

export { findDeviceBySlug };
