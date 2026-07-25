/** Mode paiement test — actif si PAYMENT_TEST_MODE=true, interdit hors localhost en production. */
export function isPaymentTestMode(): boolean {
  if (process.env.PAYMENT_TEST_MODE !== "true") return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const isLocal = /localhost|127\.0\.0\.1/i.test(appUrl);
  if (process.env.NODE_ENV === "production" && !isLocal) {
    console.error("[All Vap's] PAYMENT_TEST_MODE ignoré en production non-locale");
    return false;
  }
  return true;
}

export function isTestCheckoutId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("TEST_");
}

export function makeTestCheckoutId(orderId: string): string {
  return `TEST_${orderId}`;
}
