/**
 * Mode maintenance public — activé via MAINTENANCE_MODE=true
 *
 * Accès propriétaire :
 * 1. Cookie via URL : /?mt_bypass=SECRET (SECRET = MAINTENANCE_BYPASS_SECRET)
 * 2. Compte ADMIN déjà connecté (cookie allvaps_token)
 * 3. Localhost (sauf MAINTENANCE_FORCE_LOCAL=true)
 * 4. Pages login + API auth toujours accessibles pour se connecter
 */

export const MAINTENANCE_COOKIE = "av_mt_bypass";
export const AUTH_COOKIE_NAME = "allvaps_token";

export function isMaintenanceEnabled(): boolean {
  const raw = (process.env.MAINTENANCE_MODE || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

export function shouldForceMaintenanceOnLocalhost(): boolean {
  const raw = (process.env.MAINTENANCE_FORCE_LOCAL || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

export function getMaintenanceBypassSecret(): string {
  return (process.env.MAINTENANCE_BYPASS_SECRET || "").trim();
}

export function isMaintenanceExemptPath(pathname: string): boolean {
  if (pathname === "/maintenance") return true;
  if (pathname === "/boutiques" || pathname.startsWith("/boutiques/")) return true;
  if (pathname === "/login") return true;
  if (pathname === "/mot-de-passe-oublie") return true;
  if (pathname === "/changer-mot-de-passe") return true;
  if (pathname === "/inventaire" || pathname.startsWith("/inventaire/")) return true;
  if (pathname === "/acces" || pathname.startsWith("/acces/")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/api/inventaire")) return true;
  if (pathname.startsWith("/api/admin")) return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/internal/ava-test")) return true;
  if (pathname.startsWith("/api/internal/ava-device")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/sumup/webhook")) return true;
  if (pathname.startsWith("/api/viva/webhook")) return true;
  if (pathname === "/manifest-inventaire.webmanifest") return true;
  if (pathname === "/sw.js") return true;
  return false;
}
