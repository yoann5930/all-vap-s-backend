import { PrismaClient } from "@prisma/client";
import { createDemoPrismaClient, isDemoMode } from "@/lib/demo";
import { isProductionDeployment } from "@/lib/production-guards";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | ReturnType<typeof createDemoPrismaClient> | undefined;
};

/**
 * Répare DATABASE_URL=[SENSITIVE] injecté par l'environnement local (Cursor),
 * sans importer `fs` (sinon Next.js échoue au bundle client via lib/ai).
 * En prod Vercel, DATABASE_URL est déjà une URL Postgres valide.
 */
function repairDatabaseUrlPlaceholder() {
  const current = (process.env.DATABASE_URL || "").trim();
  if (current && current !== "[SENSITIVE]") return;
  // Ne pas lire de fichiers ici — laisser Prisma échouer clairement si absente.
  // Les scripts locaux forcent DATABASE_URL depuis .env avant d'importer prisma.
  if (current === "[SENSITIVE]") {
    delete process.env.DATABASE_URL;
  }
}

repairDatabaseUrlPlaceholder();

function createClient() {
  if (isDemoMode()) {
    if (isProductionDeployment()) {
      throw new Error(
        "[All Vap's] DEMO_MODE interdit en production. Configurez DATABASE_URL et DEMO_MODE=false."
      );
    }
    console.warn("[All Vap's] Prisma DEMO — données en mémoire uniquement.");
    return createDemoPrismaClient();
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = (globalForPrisma.prisma ?? createClient()) as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
