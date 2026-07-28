/**
 * Compte les produits via DATABASE_URL (fichier .env passé en argv[2]).
 * N'affiche jamais l'URL.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

function loadDatabaseUrl(envPath: string): string {
  const raw = fs.readFileSync(envPath, "utf8");
  const m = raw.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error(`DATABASE_URL manquante dans ${envPath}`);
  let url = m[1].trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1);
  }
  return url;
}

async function main() {
  const envPath = process.argv[2] || ".env.production.local";
  const url = loadDatabaseUrl(envPath);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [total, active, liquidarom, sample] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({
        where: { brand: { equals: "Liquidarom", mode: "insensitive" } },
      }),
      prisma.product.findMany({
        take: 5,
        select: { name: true, brand: true, isActive: true, stock: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    console.log(JSON.stringify({ envPath, total, active, liquidarom, sample }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
