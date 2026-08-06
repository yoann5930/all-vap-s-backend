/**
 * Compatibilité résistances — JAMAIS sans appareil + cartouche confirmés.
 */
import {
  requireCartridgeConfirmed,
  requireDeviceConfirmed,
  type ConfirmedDeviceContext,
  type DeviceGateResult,
} from "@/lib/ava/device-confirmation";
import { findDeviceBySlug, listDevices } from "@/lib/ava/device-support";
import type { VapeDeviceManual } from "@/lib/ava/device-types";
import { normalizeLoose } from "@/lib/ava/normalize-loose";

function findDeviceForContext(ctx: ConfirmedDeviceContext): VapeDeviceManual | null {
  const slug = `${ctx.manufacturer}-${ctx.model}`;
  const direct = findDeviceBySlug(slug);
  if (direct) return direct;
  const nMan = normalizeLoose(ctx.manufacturer);
  const nModel = normalizeLoose(ctx.model);
  return (
    listDevices().find(
      (d) =>
        normalizeLoose(d.manufacturer) === nMan &&
        normalizeLoose(d.model) === nModel
    ) ?? null
  );
}

export function getCompatibleCoils(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult & { coils?: VapeDeviceManual["compatibleCoils"] } {
  const cart = requireCartridgeConfirmed(ctx);
  if (!cart.allowed) return cart;
  const device = findDeviceForContext(cart.context);
  return {
    allowed: true,
    context: cart.context,
    coils: device?.compatibleCoils ?? [],
  };
}

export function getCompatibleCartridges(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult & { cartridges?: string[] } {
  const gate = requireDeviceConfirmed(ctx);
  if (!gate.allowed) return gate;
  const device = findDeviceForContext(gate.context);
  return {
    allowed: true,
    context: gate.context,
    cartridges: device?.compatibleCartridges ?? device?.compatiblePods ?? [],
  };
}

export function getRecommendedWattage(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult & { wattage?: string } {
  const cart = requireCartridgeConfirmed(ctx);
  if (!cart.allowed) return cart;
  const device = findDeviceForContext(cart.context);
  return {
    allowed: true,
    context: cart.context,
    wattage: device?.technicalSpecs.powerRangeW,
  };
}

export { requireCartridgeConfirmed, requireDeviceConfirmed };
