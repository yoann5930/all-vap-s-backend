/**
 * Routage post-login & mapping rôles — pur (utilisable client + serveur).
 * Aucun import Prisma / JWT ici.
 */
import { isOwnerRole } from "@/lib/admin/roles";

export type AppRole = "OWNER" | "ADMIN" | "EMPLOYEE" | "CLIENT";
export type AvaSurface = "ADMIN" | "CLIENT" | "EMPLOYEE";

export function mapDbRoleToAppRoleSync(
  dbRole: string,
  opts?: { isOwnerIdentity?: boolean }
): AppRole {
  const role = (dbRole || "").toUpperCase();
  if (role === "CUSTOMER" || role === "CLIENT" || role === "USER") return "CLIENT";
  if (role === "EMPLOYEE" || role === "EMPLOYE") return "EMPLOYEE";
  if (isOwnerRole(role)) return opts?.isOwnerIdentity ? "OWNER" : "ADMIN";
  return "CLIENT";
}

export function permissionsForRole(role: AppRole): {
  admin: boolean;
  inventaire: boolean;
  client: boolean;
  avaAdmin: boolean;
  avaClient: boolean;
} {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return {
        admin: true,
        inventaire: true,
        client: true,
        avaAdmin: true,
        avaClient: true,
      };
    case "EMPLOYEE":
      return {
        admin: false,
        inventaire: true,
        client: true,
        avaAdmin: false,
        avaClient: true,
      };
    case "CLIENT":
    default:
      return {
        admin: false,
        inventaire: false,
        client: true,
        avaAdmin: false,
        avaClient: true,
      };
  }
}

export function defaultSurfaceForRole(role: AppRole): AvaSurface {
  if (role === "OWNER" || role === "ADMIN") return "ADMIN";
  if (role === "EMPLOYEE") return "EMPLOYEE";
  return "CLIENT";
}

/**
 * Destination post-login — source de vérité unique.
 */
export function resolvePostLoginPath(
  role: AppRole,
  next?: string | null,
  opts?: { mustChangePassword?: boolean }
): string {
  if (opts?.mustChangePassword) {
    const fallback =
      role === "CLIENT" ? "/account" : role === "EMPLOYEE" ? "/inventaire" : "/admin";
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
    return `/changer-mot-de-passe?next=${encodeURIComponent(safeNext)}`;
  }

  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  if (safeNext) {
    if (safeNext.startsWith("/admin") && (role === "OWNER" || role === "ADMIN")) {
      return safeNext;
    }
    if (
      (safeNext.startsWith("/inventaire") || safeNext.startsWith("/admin/inventaire")) &&
      (role === "OWNER" || role === "ADMIN" || role === "EMPLOYEE")
    ) {
      return safeNext;
    }
    if (
      !safeNext.startsWith("/admin") &&
      !safeNext.startsWith("/api/") &&
      role === "CLIENT"
    ) {
      return safeNext;
    }
  }

  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "/admin";
    case "EMPLOYEE":
      return "/inventaire";
    case "CLIENT":
    default:
      return "/account";
  }
}

export function isStaffAppRole(role: AppRole | string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "EMPLOYEE";
}
