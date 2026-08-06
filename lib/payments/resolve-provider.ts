import { isSumUpConfigured } from "@/lib/payments/sumup";
import { isVivaConfigured } from "@/lib/payments/viva";
import { isPaymentTestMode } from "@/lib/payments/test-mode";

export type OnlinePaymentProvider = "viva" | "sumup";

/**
 * Choisit la passerelle côté serveur uniquement.
 * - Priorité : VIVA si configurée
 * - SumUp online uniquement si PAYMENT_ONLINE_PROVIDER=sumup ET clés présentes
 * - Mode test local : simule la passerelle préférée sans exposer le nom au client
 */
export function resolveOnlinePaymentProvider(): {
  provider: OnlinePaymentProvider | null;
  configured: boolean;
  testMode: boolean;
  reason?: string;
} {
  const testMode = isPaymentTestMode();
  const preferred = (process.env.PAYMENT_ONLINE_PROVIDER || "viva").toLowerCase();

  if (preferred === "sumup") {
    if (isSumUpConfigured() || testMode) {
      return { provider: "sumup", configured: true, testMode };
    }
    return {
      provider: null,
      configured: false,
      testMode,
      reason: "SUMUP_ONLINE_UNAVAILABLE",
    };
  }

  // Défaut / viva
  if (isVivaConfigured() || testMode) {
    return { provider: "viva", configured: true, testMode };
  }

  // Secours SumUp uniquement si explicitement autorisé
  if (process.env.PAYMENT_ALLOW_SUMUP_FALLBACK === "true" && isSumUpConfigured()) {
    return { provider: "sumup", configured: true, testMode: false };
  }

  return {
    provider: null,
    configured: false,
    testMode,
    reason: "NO_ONLINE_GATEWAY",
  };
}
