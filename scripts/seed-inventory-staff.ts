import prisma from "../lib/prisma";
import { INVENTORY_STAFF } from "../lib/inventory/staff-accounts";
import {
  loadOrCreateStaffCredentials,
  credentialsFilePaths,
} from "./lib-staff-credentials";
import { isDemoMode } from "../lib/demo";
import { resetDemoStore } from "../lib/demo";

async function main() {
  const creds = loadOrCreateStaffCredentials();
  const paths = credentialsFilePaths();

  if (isDemoMode()) {
    resetDemoStore();
  }

  for (const def of INVENTORY_STAFF) {
    const cred = creds.find((c) => c.email === def.email);
    if (!cred) throw new Error(`Credential manquant pour ${def.email}`);

    const existing = await prisma.user.findUnique({ where: { email: def.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: def.email },
        data: {
          firstName: def.firstName,
          lastName: def.lastName,
          role: def.role,
          allowedStores: def.allowedStores,
          active: true,
          ...(existing.mustChangePassword
            ? { passwordHash: cred.passwordHash, mustChangePassword: true }
            : {}),
        },
      });
      console.log(`updated: ${def.email} (${def.role})`);
    } else {
      await prisma.user.create({
        data: {
          email: def.email,
          firstName: def.firstName,
          lastName: def.lastName,
          role: def.role,
          allowedStores: def.allowedStores,
          active: true,
          mustChangePassword: true,
          passwordHash: cred.passwordHash,
          emailVerified: true,
        },
      });
      console.log(`created: ${def.email} (${def.role})`);
    }
  }

  console.log(`mode=${isDemoMode() ? "DEMO" : "DB"}`);
  console.log(`credentials_file=${paths.credentialsPath}`);
  console.log("OK — identifiants hors Git (.local/) + hashes générés");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect?.().catch(() => undefined);
  });
