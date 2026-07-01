import { PrismaClient } from "@prisma/client";
import { createDemoPrismaClient, isDemoMode } from "@/lib/demo";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | ReturnType<typeof createDemoPrismaClient> | undefined;
};

function createClient() {
  if (isDemoMode()) {
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
