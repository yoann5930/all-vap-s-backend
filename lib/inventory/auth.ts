import { requireAuth, getAuthUser, type JwtPayload } from "@/lib/jwt";
import type { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isStoreStockCode } from "@/lib/catalog/normalize";

export type InventoryAuthUser = JwtPayload & {
  active: boolean;
  mustChangePassword: boolean;
  allowedStores: string[];
  firstName: string | null;
  lastName: string | null;
};

async function loadInventoryUser(base: JwtPayload): Promise<InventoryAuthUser> {
  const user = await prisma.user.findUnique({
    where: { id: base.userId },
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      allowedStores: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!user) throw new Error("UNAUTHORIZED");
  if (!user.active) throw new Error("ACCOUNT_DISABLED");
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    allowedStores: user.allowedStores || [],
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/** EMPLOYEE ou ADMIN — inventaire authentifié. */
export async function requireInventoryAuth(): Promise<InventoryAuthUser> {
  const base = await requireAuth("EMPLOYEE" as Role);
  const user = await loadInventoryUser(base);
  if (user.role !== "EMPLOYEE" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  if (user.mustChangePassword) {
    throw new Error("MUST_CHANGE_PASSWORD");
  }
  return user;
}

export async function requireAdminAuth(): Promise<InventoryAuthUser> {
  const base = await requireAuth("ADMIN");
  return loadInventoryUser(base);
}

export function assertStoreAllowed(user: InventoryAuthUser, locationCode: string): void {
  if (!isStoreStockCode(locationCode)) throw new Error("FORBIDDEN");
  if (user.role === "ADMIN") return;
  if (!user.allowedStores.includes(locationCode)) {
    throw new Error("STORE_NOT_ALLOWED");
  }
}

export function displayEmployeeName(user: InventoryAuthUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

export async function getOptionalAuthUser() {
  return getAuthUser();
}
