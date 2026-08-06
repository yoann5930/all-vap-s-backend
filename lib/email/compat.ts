import { getEmailConfig } from "./config";

/** Compatibilité avec l'ancien isEmailConfigured() */
export function isEmailConfigured(): boolean {
  const cfg = getEmailConfig();
  if (!cfg.enabled) return false;
  if (cfg.transportPreference === "console") return true;
  if (cfg.resendConfigured) return true;
  if (cfg.smtp.host && cfg.smtp.user && cfg.smtp.hasPassword) return true;
  if (/localhost|127\.0\.0\.1/i.test(cfg.publicUrl)) return true;
  return process.env.NODE_ENV !== "production";
}
