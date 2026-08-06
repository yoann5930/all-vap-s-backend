/**
 * Contexte appareil confirmé — verrou technique obligatoire.
 */
export type ConfirmationMethod =
  | "CLIENT_SELECTED_IMAGE"
  | "CLIENT_UPLOADED_PHOTO"
  | "EXACT_TEXT_AND_IMAGE_CONFIRMATION"
  | "USER_EXPLICIT_TEXT";

export type ConfirmedDeviceContext = {
  manufacturer: string;
  model: string;
  version?: string;
  cartridge?: string;
  tank?: string;
  confirmationMethod: ConfirmationMethod;
  confirmedAt: string;
  confidence: number;
};

export type DeviceGateResult =
  | { allowed: true; context: ConfirmedDeviceContext }
  | {
      allowed: false;
      reason: "DEVICE_NOT_CONFIRMED" | "CARTRIDGE_NOT_CONFIRMED";
      requiredAction: "SHOW_DEVICE_CONFIRMATION" | "SHOW_CARTRIDGE_CONFIRMATION";
    };

export function isDeviceConfirmed(
  ctx: ConfirmedDeviceContext | null | undefined
): ctx is ConfirmedDeviceContext {
  return Boolean(
    ctx &&
      ctx.confidence >= 0.75 &&
      ctx.manufacturer &&
      ctx.model &&
      ctx.confirmedAt &&
      ctx.confirmationMethod
  );
}

export function isCartridgeConfirmed(
  ctx: ConfirmedDeviceContext | null | undefined
): boolean {
  return isDeviceConfirmed(ctx) && Boolean(ctx.cartridge || ctx.tank);
}

export function requireDeviceConfirmed(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult {
  if (!isDeviceConfirmed(ctx)) {
    return {
      allowed: false,
      reason: "DEVICE_NOT_CONFIRMED",
      requiredAction: "SHOW_DEVICE_CONFIRMATION",
    };
  }
  return { allowed: true, context: ctx };
}

export function requireCartridgeConfirmed(
  ctx: ConfirmedDeviceContext | null | undefined
): DeviceGateResult {
  const base = requireDeviceConfirmed(ctx);
  if (!base.allowed) return base;
  if (!isCartridgeConfirmed(ctx)) {
    return {
      allowed: false,
      reason: "CARTRIDGE_NOT_CONFIRMED",
      requiredAction: "SHOW_CARTRIDGE_CONFIRMATION",
    };
  }
  return base;
}

export function invalidateDeviceContext(): null {
  return null;
}

const SWITCH_PHRASES =
  /autre cigarette|pas celle[- ]ci|ce n['’]est pas|changé de cartouche|change de cartouche|autre box|autre pod/i;

export function shouldInvalidateDeviceContext(message: string): boolean {
  return SWITCH_PHRASES.test(message);
}
