/**
 * Gardes démarrage production — refuse les modes fictifs en ligne.
 */

/** APP_URL pointe vers localhost (dev local uniquement). */
export function isLocalAppUrl(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return /localhost|127\.0\.0\.1/i.test(appUrl);
}

/** Runtime Vercel (preview ou production) — jamais « local » même si APP_URL est mal réglé. */
export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
}

/**
 * Secrets renforcés obligatoires (JWT, etc.).
 * Fail-closed : Vercel toujours ; prod hors localhost APP_URL.
 * Un APP_URL localhost sur Vercel ne contourne plus les gardes.
 */
export function requiresHardenedSecrets(): boolean {
  if (isVercelRuntime()) return true;
  if (process.env.NODE_ENV === "production" && !isLocalAppUrl()) return true;
  return false;
}

export function assertProductionSafeBoot(): void {
  const hardened = requiresHardenedSecrets();
  const localOnly = isLocalAppUrl() && !isVercelRuntime();

  if (process.env.DEMO_MODE === "true") {
    if (hardened) {
      throw new Error(
        "[All Vap's] DEMO_MODE=true interdit en production. Utilisez PostgreSQL réel (DEMO_MODE=false)."
      );
    }
    console.warn(
      "[All Vap's] DEMO_MODE actif — données en mémoire, non destinées à la vente réelle."
    );
  }

  if (hardened) {
    const secret = (process.env.JWT_SECRET || "").trim();
    if (!secret || secret.includes("change-me") || secret.length < 32) {
      throw new Error(
        "[All Vap's] JWT_SECRET manquant ou trop faible (< 32) en déploiement."
      );
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
  } else if (localOnly && process.env.NODE_ENV === "production") {
    console.warn(
      "[All Vap's] NODE_ENV=production avec APP_URL localhost — mode local, gardes assouplies."
    );
  }
}

export function isProductionDeployment(): boolean {
  return requiresHardenedSecrets() && process.env.NODE_ENV === "production";
}
