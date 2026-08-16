import { NICOTINE_CONFIG } from "./config";

export type DeviceRisk = "unknown" | "low_power" | "high_vapor" | "ok";

export function classifyDevice(input: {
  deviceType?: string;
  resistanceOhm?: number;
  powerWatts?: number;
  inhalationType?: string;
}): DeviceRisk {
  const blob = `${input.deviceType ?? ""} ${input.inhalationType ?? ""}`.toLowerCase();
  const known =
    Boolean(blob.trim()) ||
    input.resistanceOhm != null ||
    input.powerWatts != null;
  if (!known) return "unknown";

  if (
    input.powerWatts != null &&
    input.powerWatts >= NICOTINE_CONFIG.device.highPowerWattsFrom
  ) {
    return "high_vapor";
  }
  if (NICOTINE_CONFIG.device.highVaporKeywords.some((k) => blob.includes(k))) {
    return "high_vapor";
  }
  if (/pod|mtl|serr[eé]|faible puissance|aio/.test(blob)) return "low_power";
  if (input.powerWatts != null && input.powerWatts > 0 && input.powerWatts < 25) {
    return "low_power";
  }
  return "ok";
}

export function saltHighDoseNeedsDevice(mgMl: number): boolean {
  return mgMl >= NICOTINE_CONFIG.salts.highDoseFromMgMl;
}

export const DEVICE_QUESTIONS = [
  "type_appareil",
  "type_resistance",
  "valeur_resistance",
  "puissance",
  "type_inhalation",
] as const;
