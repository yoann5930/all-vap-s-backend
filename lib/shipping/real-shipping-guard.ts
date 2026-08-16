/**
 * Barrière anti-achat d'étiquette / opération transporteur payante.
 * Démo et tests : jamais d'achat réel sans ALLOW_REAL_SHIPPING=true explicite.
 */

function truthy(v: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((v || "").trim().toLowerCase());
}

export function isDemoMode(): boolean {
  return truthy(process.env.DEMO_MODE);
}

/** Achat / validation d'expédition réelle — opt-in explicite uniquement. */
export function isRealShippingAllowed(): boolean {
  if (isDemoMode()) return false;
  return truthy(process.env.ALLOW_REAL_SHIPPING);
}

export function assertNoPaidShipping(context: string): {
  allowed: boolean;
  reason: string;
} {
  if (isDemoMode()) {
    return { allowed: false, reason: `DEMO_MODE=true — ${context} bloqué` };
  }
  if (!isRealShippingAllowed()) {
    return { allowed: false, reason: `ALLOW_REAL_SHIPPING≠true — ${context} bloqué` };
  }
  return { allowed: true, reason: "real_shipping_enabled" };
}
