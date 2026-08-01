/**
 * Catalogue notices matériels — charge `data/ava/devices/index.json`
 * (régénéré par `npm run ava:devices:import`). Safe client + serveur.
 */
import type { VapeDeviceManual } from "@/lib/ava/device-types";
import {
  requireDeviceConfirmed,
  requireCartridgeConfirmed,
  type ConfirmedDeviceContext,
  type DeviceGateResult,
} from "@/lib/ava/device-confirmation";
import { normalizeLoose } from "@/lib/ava/normalize-loose";
import aliases from "@/data/ava/device-aliases.json";
import deviceIndex from "@/data/ava/devices/index.json";

type IndexDevice = Partial<VapeDeviceManual> & {
  manufacturer: string;
  model: string;
  manufacturerSlug?: string;
  modelSlug?: string;
  file?: string;
};

function hydrate(raw: IndexDevice): VapeDeviceManual {
  const manufacturerSlug =
    raw.manufacturerSlug ||
    normalizeLoose(raw.manufacturer).replace(/\s+/g, "-");
  const modelSlug =
    raw.modelSlug || normalizeLoose(raw.model).replace(/\s+/g, "-");
  return {
    ...(raw as VapeDeviceManual),
    manufacturerSlug,
    modelSlug,
    aliases: raw.aliases || [],
    verificationStatus: raw.verificationStatus || "NEEDS_OFFICIAL_DATA",
  };
}

const DEVICES: VapeDeviceManual[] = (
  (deviceIndex as unknown as { devices: IndexDevice[] }).devices || []
).map(hydrate);

export function listDevices(): VapeDeviceManual[] {
  return DEVICES;
}

export function findDeviceBySlug(slug: string): VapeDeviceManual | null {
  const s = normalizeLoose(slug).replace(/\s+/g, "-");
  return (
    DEVICES.find(
      (d) =>
        normalizeLoose(d.modelSlug) === s ||
        normalizeLoose(`${d.manufacturerSlug}-${d.modelSlug}`) === s ||
        normalizeLoose(`${d.manufacturer}-${d.model}`).replace(/\s+/g, "-") ===
          s
    ) ?? null
  );
}

export function searchDevices(query: string, limit = 3): VapeDeviceManual[] {
  const q = normalizeLoose(query);
  if (!q) return [];

  const scored = DEVICES.map((d) => {
    let score = 0;
    const hay = normalizeLoose(
      `${d.manufacturer} ${d.model} ${(d.aliases || []).join(" ")}`
    );
    if (hay.includes(q)) score += 10;
    for (const part of q.split(" ")) {
      if (part.length > 2 && hay.includes(part)) score += 2;
    }
    for (const [brand, list] of Object.entries(
      aliases as Record<string, string[]>
    )) {
      if (normalizeLoose(brand) === normalizeLoose(d.manufacturer)) {
        if (list.some((a) => q.includes(normalizeLoose(a)))) score += 3;
      }
    }
    return { d, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((x) => x.d);
}

export function getDeviceControls(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult & { controls?: VapeDeviceManual["controls"] } {
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
  return { allowed: true, context: gate.context, controls: device.controls };
}

export function getFillingProcedure(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult & { steps?: string[] } {
  const gate = requireDeviceConfirmed(ctx);
  if (!gate.allowed) return gate;
  const device = findDeviceBySlug(
    `${gate.context.manufacturer}-${gate.context.model}`
  );
  return {
    allowed: true,
    context: gate.context,
    steps: device?.fillingProcedure ?? [],
  };
}

export function getCoilReplacementProcedure(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult & { steps?: string[] } {
  const gate = requireDeviceConfirmed(ctx);
  if (!gate.allowed) return gate;
  const cart = requireCartridgeConfirmed(ctx);
  if (!cart.allowed) return cart;
  const device = findDeviceBySlug(
    `${gate.context.manufacturer}-${gate.context.model}`
  );
  return {
    allowed: true,
    context: gate.context,
    steps: device?.podReplacementProcedure ?? [],
  };
}

export function devicesWithoutOfficialManual(): VapeDeviceManual[] {
  return DEVICES.filter(
    (d) =>
      !d.officialManualUrl || d.verificationStatus !== "OFFICIAL_CONFIRMED"
  );
}

export function devicesStats() {
  return {
    total: DEVICES.length,
    verified: DEVICES.filter((d) => d.verificationStatus === "OFFICIAL_CONFIRMED")
      .length,
    needsOfficial: DEVICES.filter(
      (d) => d.verificationStatus === "NEEDS_OFFICIAL_DATA"
    ).length,
    needsConfirmation: DEVICES.filter(
      (d) => d.verificationStatus === "NEEDS_CONFIRMATION"
    ).length,
    withoutManual: devicesWithoutOfficialManual().length,
    withoutPhoto: DEVICES.filter(
      (d) => !d.images || Object.keys(d.images).length === 0
    ).length,
  };
}
