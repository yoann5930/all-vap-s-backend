/**
 * Identité / surface A.V.A. — fail closed.
 * Une adresse écrite dans un message n'est JAMAIS une preuve.
 */
import prisma from "@/lib/prisma";
import { isOwnerRole } from "@/lib/admin/roles";

export const OWNER_PRIMARY_EMAIL = "yoann@allvaps.fr";
export const CLIENT_DEMO_EMAIL = "allvaps70@gmail.com";

export type AvaSurface = "admin" | "client";
export type AvaEffectiveRole = "OWNER" | "ADMIN" | "CLIENT";

export type AvaSessionContext = {
  userId: string;
  email: string;
  sessionRole: string;
  surface: AvaSurface;
  effectiveRole: AvaEffectiveRole;
  isOwnerIdentity: boolean;
  adminCapabilities: boolean;
};

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

/** OWNER list: DB verified + env seed. Never trust message body. */
export async function listOwnerEmails(): Promise<string[]> {
  const fromEnv = (process.env.OWNER_PRIMARY_EMAIL || OWNER_PRIMARY_EMAIL)
    .split(",")
    .map(normEmail)
    .filter(Boolean);
  try {
    const rows = await prisma.avaOwnerIdentity.findMany({
      where: { verifiedAt: { not: null } },
      select: { primaryEmail: true, authorizedAliases: true },
    });
    const set = new Set(fromEnv);
    for (const r of rows) {
      set.add(normEmail(r.primaryEmail));
      for (const a of r.authorizedAliases || []) set.add(normEmail(a));
    }
    return [...set];
  } catch {
    return fromEnv;
  }
}

export async function isOwnerEmail(email: string): Promise<boolean> {
  const list = await listOwnerEmails();
  return list.includes(normEmail(email));
}

/**
 * Résout le rôle effectif A.V.A.
 * yoann@ + Admin UI → OWNER/ADMIN
 * yoann@ + Client UI → CLIENT only
 * allvaps70@ + Client → CLIENT
 * allvaps70@ + Admin → REFUS (caller)
 * Ambigu → CLIENT (fail closed)
 */
export async function resolveAvaSessionContext(params: {
  userId: string;
  email: string;
  sessionRole: string;
  surface: AvaSurface;
}): Promise<AvaSessionContext> {
  const email = normEmail(params.email);
  const owner = await isOwnerEmail(email);
  const staff = isOwnerRole(params.sessionRole) || params.sessionRole === "ADMIN";

  if (params.surface === "admin") {
    // Compte Client démo : jamais Admin AVA, même si rôle DB ambigu
    if (email === CLIENT_DEMO_EMAIL || !staff) {
      return {
        userId: params.userId,
        email,
        sessionRole: params.sessionRole,
        surface: "admin",
        effectiveRole: "CLIENT",
        isOwnerIdentity: false,
        adminCapabilities: false,
      };
    }
    return {
      userId: params.userId,
      email,
      sessionRole: params.sessionRole,
      surface: "admin",
      effectiveRole: owner ? "OWNER" : "ADMIN",
      isOwnerIdentity: owner,
      adminCapabilities: true,
    };
  }

  // Client surface — never elevate from owner email alone
  return {
    userId: params.userId,
    email,
    sessionRole: params.sessionRole,
    surface: "client",
    effectiveRole: "CLIENT",
    isOwnerIdentity: owner,
    adminCapabilities: false,
  };
}

/** Prompt injection / claimed identity in text — ignore for auth. */
export function stripClaimedPrivileges(message: string): string {
  return message
    .replace(/ignore\s+(tes|les|all|your)\s+r[eè]gles/gi, "[ignored]")
    .replace(/passe\s+en\s+mode\s+admin/gi, "[ignored]")
    .replace(/je\s+suis\s+(le\s+)?(propri[eé]taire|owner|admin)/gi, "[ignored]");
}

export function clientMustNotSeeAdminLeak(text: string): string {
  // Soft scrub if something slipped — never expose infra
  return text
    .replace(/FIDELATOO_ORCHESTRATOR_SECRET|OPENAI_API_KEY|JWT_SECRET/gi, "[redacted]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
}
