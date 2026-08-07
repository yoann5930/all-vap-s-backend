/**
 * Seed CI / Vercel — crée les comptes inventaire manquants à partir des
 * hashes bcrypt COMMITÉS (lib/inventory/staff-hashes.generated.ts).
 *
 * - N’écrit aucun secret en clair
 * - Ne régénère aucun mot de passe
 * - Ne modifie JAMAIS le passwordHash d’un compte déjà présent
 * - Idempotent et sûr à exécuter à chaque build
 */
import prisma from "../lib/prisma";
import { INVENTORY_STAFF } from "../lib/inventory/staff-accounts";
import { STAFF_PASSWORD_HASHES } from "../lib/inventory/staff-hashes.generated";
import { isDemoMode } from "../lib/demo";

async function main() {
  if (isDemoMode()) {
    console.log("[staff-ci] DEMO_MODE=true — skip (seed démo géré ailleurs)");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const def of INVENTORY_STAFF) {
    const passwordHash = STAFF_PASSWORD_HASHES[def.email];
    if (!passwordHash) {
      console.warn(
        `[staff-ci] hash manquant pour ${def.email} — skip création (sync API / seed manuel)`
      );
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email: def.email } });
    if (existing) {
      // Préserve le hash / MDP déjà en base — pas d’écrasement.
      await prisma.user.update({
        where: { email: def.email },
        data: {
          firstName: def.firstName,
          lastName: def.lastName,
          role: def.role,
          allowedStores: def.allowedStores,
          active: true,
          emailVerified: true,
        },
      });
      skipped += 1;
      console.log(`[staff-ci] exists: ${def.email}`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: def.email,
        firstName: def.firstName,
        lastName: def.lastName,
        role: def.role,
        allowedStores: def.allowedStores,
        active: true,
        mustChangePassword: true,
        passwordHash,
        emailVerified: true,
      },
    });
    created += 1;
    console.log(`[staff-ci] created: ${def.email}`);
  }

  console.log(`[staff-ci] done created=${created} existing=${skipped}`);
}

main()
  .catch((e) => {
    console.error("[staff-ci] FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect?.().catch(() => undefined);
  });
