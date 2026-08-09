/**
 * Auth de test STRICTEMENT Preview (Vercel).
 * - Jamais en production
 * - Ne modifie jamais le hash bcrypt OWNER
 * - Accepte uniquement AUTH_PREVIEW_TEST_PASSWORD (env Preview)
 */

import { timingSafeEqual } from "crypto";
import { isOwnerRole } from "@/lib/admin/roles";

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

const PROD_HOSTS = new Set([
  "allvaps.fr",
  "www.allvaps.fr",
  "inventaire.allvaps.fr",
]);

/**
 * True uniquement sur déploiement Vercel Preview.
 * Refus catégorique production / domaines custom prod.
 */
export function isPreviewAuthTestEnvironment(opts?: {
  host?: string | null;
}): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.AUTH_PREVIEW_TEST_ENABLED === "0") return false;
  if (process.env.VERCEL_ENV !== "preview") return false;

  const host = (opts?.host || "").split(":")[0].trim().toLowerCase();
  if (host && PROD_HOSTS.has(host)) return false;
  // Preview doit être sur *.vercel.app (pas domaine custom prod)
  if (host && !host.endsWith(".vercel.app") && host !== "localhost") {
    return false;
  }

  return true;
}

export function getPreviewTestEmailAllowlist(): string[] {
  const raw =
    process.env.AUTH_PREVIEW_TEST_EMAIL ||
    process.env.OWNER_PRIMARY_EMAIL ||
    "yoann@allvaps.fr";
  return raw
    .split(",")
    .map(normEmail)
    .filter(Boolean);
}

/**
 * Vérifie si le couple email/password peut ouvrir une session via secret Preview.
 * Ne lit jamais / n'écrit jamais le passwordHash.
 */
export function matchesPreviewTestCredentials(params: {
  email: string;
  password: string;
  host?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!isPreviewAuthTestEnvironment({ host: params.host })) {
    return { ok: false, reason: "not_preview" };
  }

  const secret = process.env.AUTH_PREVIEW_TEST_PASSWORD || "";
  if (!secret || secret.length < 16) {
    return { ok: false, reason: "secret_missing" };
  }

  const email = normEmail(params.email);
  const allow = getPreviewTestEmailAllowlist();
  if (!allow.includes(email)) {
    return { ok: false, reason: "email_not_allowlisted" };
  }

  if (!params.password || !safeEqual(params.password, secret)) {
    return { ok: false, reason: "bad_secret" };
  }

  return { ok: true };
}

export function assertPreviewTestUserEligible(user: {
  email: string;
  role: string;
  active?: boolean | null;
}): { ok: true } | { ok: false; reason: string } {
  if (user.active === false) return { ok: false, reason: "inactive" };
  if (!isOwnerRole(user.role) && user.role !== "ADMIN") {
    return { ok: false, reason: "not_admin" };
  }
  return { ok: true };
}
