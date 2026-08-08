import { PrismaClient } from "@prisma/client";
import { createDemoPrismaClient, isDemoMode } from "@/lib/demo";
import { isProductionDeployment } from "@/lib/production-guards";
import fs from "fs";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | ReturnType<typeof createDemoPrismaClient> | undefined;
};

/** Si le process injecte DATABASE_URL=[SENSITIVE], recharger depuis .env fichier. */
function repairDatabaseUrlFromFiles() {
  const current = (process.env.DATABASE_URL || "").trim();
  const usable =
    (current.startsWith("postgres") || current.startsWith("prisma")) &&
    current.includes("@") &&
    current !== "[SENSITIVE]";
  if (usable) return;

  const candidates = [".env", ".env.production.local", ".env.local"];
  for (const file of candidates) {
    try {
      const full = path.join(process.cwd(), file);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, "utf8");
      const m = text.match(/^DATABASE_URL=(.*)$/m);
      if (!m) continue;
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (
        (v.startsWith("postgres") || v.startsWith("prisma")) &&
        v.includes("@") &&
        v !== "[SENSITIVE]"
      ) {
        process.env.DATABASE_URL = v;
        return;
      }
    } catch {
      /* ignore */
    }
  }
}

repairDatabaseUrlFromFiles();

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
