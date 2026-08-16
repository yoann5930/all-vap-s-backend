/**
 * Non-régression catalogue live (Prisma). N'imprime pas de liste produits complète.
 * npx tsx scripts/ava-catalog-live-proof.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { getAvaCatalogService } from "../lib/ai/ava/ava-catalog-service";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

async function main() {
  const db = !!(process.env.DATABASE_URL || "").trim();
  if (!db) {
    console.log(JSON.stringify({ dbConfigured: false, skipped: true }));
    process.exit(0);
  }
  const svc = getAvaCatalogService();
  const size = await svc.refresh();
  const absent = await svc.searchProducts("xyzzy-produit-inexistant-ava-test", {
    limit: 5,
  });
  const sample = await svc.searchProducts("fraise", { limit: 3 });
  const first = sample[0]?.product;
  let exactRecall = false;
  let stockKnown = false;
  if (first?.name) {
    const again = await svc.searchProducts(first.name, { limit: 5 });
    exactRecall = again.some((r) => r.product.id === first.id);
    const avail = await svc.getProductAvailability(first.id);
    stockKnown = avail.status !== "information_manquante";
  }
  console.log(
    JSON.stringify({
      dbConfigured: true,
      catalogSize: size,
      absentCount: absent.length,
      sampleCount: sample.length,
      exactRecall,
      stockKnown,
    }),
  );
  if (size <= 0) process.exit(2);
  if (absent.length !== 0) process.exit(3);
  if (first && !exactRecall) process.exit(4);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.name : "catalog_live_failed");
  process.exit(1);
});
