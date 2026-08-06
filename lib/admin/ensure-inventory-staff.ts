import prisma from "@/lib/prisma";
import { hashPassword, sanitizeUser } from "@/lib/auth";
import { generateTempAccessCode } from "@/lib/admin/temp-access-code";
import { INVENTORY_STAFF } from "@/lib/inventory/staff-accounts";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
} from "@/lib/catalog/normalize";

export type IssuedAccessCode = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  temporaryPassword: string;
  created: boolean;
};

/**
 * Garantit les comptes inventaire démo + un hash bcrypt valide.
 * Renvoie les codes en clair UNIQUEMENT pour les comptes créés
 * ou ceux auxquels un hash manquant vient d’être attribué.
 * Ne régénère jamais un code existant sans forceReset.
 */
export async function ensureInventoryStaffAccessCodes(opts?: {
  forceResetMissingOnly?: boolean;
}): Promise<{
  staffCount: number;
  issued: IssuedAccessCode[];
  users: ReturnType<typeof sanitizeUser>[];
}> {
  const issued: IssuedAccessCode[] = [];
  const defaultStores = [HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE];

  for (const def of INVENTORY_STAFF) {
    const existing = await prisma.user.findUnique({ where: { email: def.email } });
    if (!existing) {
      const temporaryPassword = generateTempAccessCode();
      const passwordHash = await hashPassword(temporaryPassword);
      const user = await prisma.user.create({
        data: {
          email: def.email,
          firstName: def.firstName,
          lastName: def.lastName,
          role: def.role,
          allowedStores: def.allowedStores.length ? def.allowedStores : defaultStores,
          active: true,
          mustChangePassword: true,
          passwordHash,
          emailVerified: true,
        },
      });
      issued.push({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        temporaryPassword,
        created: true,
      });
      continue;
    }

    const hash = (existing.passwordHash || "").trim();
    if (!hash) {
      const temporaryPassword = generateTempAccessCode();
      const passwordHash = await hashPassword(temporaryPassword);
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          active: true,
          role: def.role,
          firstName: def.firstName,
          lastName: def.lastName,
          allowedStores: def.allowedStores,
        },
      });
      issued.push({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        temporaryPassword,
        created: false,
      });
    } else if (opts?.forceResetMissingOnly) {
      // no-op: hash déjà présent
    }
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "EMPLOYEE"] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return {
    staffCount: users.length,
    issued,
    users: users.map((u) => sanitizeUser(u)),
  };
}
