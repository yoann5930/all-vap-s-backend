/**
 * Source de vérité identité All Vap's — session authentifiée uniquement.
 * Ne jamais déduire un rôle à partir du texte d'un message.
 */
import { getAuthUser } from "@/lib/jwt";
import { isOwnerRole, isStaffRole } from "@/lib/admin/roles";
import { isOwnerEmail } from "@/lib/ava/identity-context";
import {
  type AppRole,
  type AvaSurface,
  defaultSurfaceForRole,
  mapDbRoleToAppRoleSync,
  permissionsForRole,
  resolvePostLoginPath,
} from "@/lib/auth/routing";

export type {
  AppRole,
  AvaSurface,
} from "@/lib/auth/routing";

export {
  mapDbRoleToAppRoleSync,
  permissionsForRole,
  defaultSurfaceForRole,
  resolvePostLoginPath,
  isStaffAppRole,
} from "@/lib/auth/routing";

export type AuthenticatedUserContext = {
  authenticated: true;
  userId: string;
  email: string;
  dbRole: string;
  role: AppRole;
  permissions: ReturnType<typeof permissionsForRole>;
  surfaceDefault: AvaSurface;
  mustChangePassword?: boolean;
  allowedStores?: string[];
};

export type UnauthenticatedContext = {
  authenticated: false;
  userId: null;
  email: null;
  dbRole: null;
  role: null;
  permissions: {
    admin: false;
    inventaire: false;
    client: false;
    avaAdmin: false;
    avaClient: false;
  };
  surfaceDefault: null;
};

export type UserContext = AuthenticatedUserContext | UnauthenticatedContext;

/**
 * OWNER uniquement si compte ADMIN authentifié ET identité OWNER vérifiée.
 * Jamais : if (email === "…") sans auth préalable.
 */
export async function resolveAppRole(
  dbRole: string,
  email: string
): Promise<AppRole> {
  const role = (dbRole || "").toUpperCase();
  if (role === "CUSTOMER" || role === "CLIENT" || role === "USER") {
    return "CLIENT";
  }
  if (role === "EMPLOYEE" || role === "EMPLOYE") {
    return "EMPLOYEE";
  }
  if (isOwnerRole(role)) {
    const owner = await isOwnerEmail(email);
    return owner ? "OWNER" : "ADMIN";
  }
  return "CLIENT";
}

export async function getAuthenticatedUserContext(): Promise<UserContext> {
  const auth = await getAuthUser();
  if (!auth) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      dbRole: null,
      role: null,
      permissions: {
        admin: false,
        inventaire: false,
        client: false,
        avaAdmin: false,
        avaClient: false,
      },
      surfaceDefault: null,
    };
  }

  const role = await resolveAppRole(auth.role, auth.email);
  return {
    authenticated: true,
    userId: auth.userId,
    email: auth.email,
    dbRole: auth.role,
    role,
    permissions: permissionsForRole(role),
    surfaceDefault: defaultSurfaceForRole(role),
  };
}

/**
 * Contexte A.V.A. dérivé de la session + surface UI (jamais du texte message).
 */
export async function getAvaSessionFromAuth(surface: AvaSurface): Promise<{
  userId: string;
  email: string;
  role: AppRole;
  permissions: ReturnType<typeof permissionsForRole>;
  surface: AvaSurface;
  adminCapabilities: boolean;
} | null> {
  const ctx = await getAuthenticatedUserContext();
  if (!ctx.authenticated) return null;

  if (surface === "ADMIN") {
    return {
      userId: ctx.userId,
      email: ctx.email,
      role: ctx.role,
      permissions: ctx.permissions,
      surface,
      adminCapabilities: ctx.permissions.avaAdmin,
    };
  }

  if (surface === "EMPLOYEE") {
    return {
      userId: ctx.userId,
      email: ctx.email,
      role: ctx.role === "CLIENT" ? "CLIENT" : ctx.role,
      permissions: {
        ...ctx.permissions,
        avaAdmin: false,
        admin: false,
      },
      surface,
      adminCapabilities: false,
    };
  }

  return {
    userId: ctx.userId,
    email: ctx.email,
    role: "CLIENT",
    permissions: permissionsForRole("CLIENT"),
    surface: "CLIENT",
    adminCapabilities: false,
  };
}

export { isStaffRole, isOwnerRole };
