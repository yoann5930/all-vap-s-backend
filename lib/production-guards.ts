/**
 * Gardes démarrage production — refuse les modes fictifs en ligne.
 */

function isLocalAppUrl(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return /localhost|127\.0\.0\.1/i.test(appUrl);
}

export function assertProductionSafeBoot(): void {
  const isProd = process.env.NODE_ENV === "production";
  const local = isLocalAppUrl();

  if (process.env.DEMO_MODE === "true") {
    if (isProd && !local) {
      throw new Error(
        "[All Vap's] DEMO_MODE=true interdit en production. Utilisez PostgreSQL réel (DEMO_MODE=false)."
      );
    }
    console.warn(
      "[All Vap's] DEMO_MODE actif — données en mémoire, non destinées à la vente réelle."
    );
  }

  if (isProd && !local) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("change-me")) {
      throw new Error("[All Vap's] JWT_SECRET faible ou manquant en production.");
    }
    if (process.env.PAYMENT_TEST_MODE === "true") {
      console.error(
        "[All Vap's] PAYMENT_TEST_MODE=true sera ignoré hors localhost (voir isPaymentTestMode)."
      );
    }
    const vivaUrl = process.env.VIVA_API_URL || "";
    if (vivaUrl.includes("demo")) {
      console.warn(
        "[All Vap's] VIVA_API_URL pointe vers le sandbox demo. Passez à https://api.vivapayments.com pour la prod."
      );
    }
  }
}

export function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === "production" && !isLocalAppUrl();
}
