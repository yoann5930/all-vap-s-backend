/**
 * Crée / met à jour le compte administrateur allvaps70@gmail.com.
 * Mot de passe UNIQUEMENT via variable d'environnement (jamais en clair dans le code).
 *
 * Usage :
 *   ADMIN_INITIAL_PASSWORD="…" npx tsx scripts/bootstrap-admin.ts
 *
 * Le compte est créé avec mustChangePassword=true.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const ADMIN_EMAIL = "allvaps70@gmail.com";
const prisma = new PrismaClient();

async function main() {
  const password = process.env.ADMIN_INITIAL_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    console.error(
      "[bootstrap-admin] Définissez ADMIN_INITIAL_PASSWORD (min 10 caractères) — jamais dans le code."
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: "Yoann",
      lastName: "All Vap's",
      role: "PROPRIETAIRE",
      emailVerified: true,
      mustChangePassword: true,
      twoFactorEnabled: false,
      loyaltyPoints: 0,
    },
    update: {
      passwordHash,
      role: "PROPRIETAIRE",
      emailVerified: true,
      mustChangePassword: true,
      firstName: "Yoann",
    },
    select: {
      id: true,
      email: true,
      role: true,
      mustChangePassword: true,
    },
  });

  console.log(
    `[bootstrap-admin] Propriétaire prêt : ${user.email} (rôle=${user.role}) — changement MDP obligatoire.`
  );
  console.log("[bootstrap-admin] Mot de passe non affiché (sécurité).");
}

main()
  .catch((e) => {
    console.error("[bootstrap-admin] échec", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
