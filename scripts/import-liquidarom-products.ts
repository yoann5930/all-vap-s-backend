/**
 * CLI : npx tsx scripts/import-liquidarom-products.ts [--dry-run]
 */
import { importBundledLiquidarom } from "../lib/catalog/liquidarom-import";
import prisma from "../lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[liquidarom] mode=${dryRun ? "DRY-RUN" : "IMPORT"}`);
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Base PostgreSQL inaccessible. Démarrez Docker : docker compose up -d"
    );
  }
  const stats = await importBundledLiquidarom(dryRun);
  console.log(JSON.stringify(stats, null, 2));
  if (stats.errors.length) {
    console.log("[liquidarom] erreurs (max 20):");
    stats.errors.slice(0, 20).forEach((e) => console.log(" -", e));
  }
}

main()
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(() => prisma.$disconnect());
