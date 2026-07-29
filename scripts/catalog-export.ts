#!/usr/bin/env tsx
/**
 * Export CSV catalogues officiels (magasin + A.V.A.) depuis PostgreSQL.
 * Usage: npx tsx scripts/catalog-export.ts
 */
import { exportOfficialCatalogues } from "../lib/catalog/catalogue-csv-export";
import prisma from "../lib/prisma";

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error("PostgreSQL inaccessible. Démarrez Docker : docker compose up -d");
  }

  const result = await exportOfficialCatalogues();
  console.log(
    JSON.stringify(
      {
        ok: true,
        magasin: result.magasin,
        ava: result.ava,
      },
      null,
      2
    )
  );
}

main()
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
