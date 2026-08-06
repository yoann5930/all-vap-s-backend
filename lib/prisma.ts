import { PrismaClient } from "@prisma/client";
import { createDemoPrismaClient, isDemoMode } from "@/lib/demo";
import { isProductionDeployment } from "@/lib/production-guards";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | ReturnType<typeof createDemoPrismaClient> | undefined;
};

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
