import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const pre = JSON.parse(
    fs.readFileSync(
      path.resolve("backups/sumup-audit-2026-08-03/pre-apply-exact/PRODUCTS_SNAPSHOT.json"),
      "utf8",
    ),
  );
  const journalPath = path.resolve("backups/sumup-audit-2026-08-03/JOURNAL_APPLY_EXACT.json");
  const journal = fs.existsSync(journalPath)
    ? JSON.parse(fs.readFileSync(journalPath, "utf8"))
    : [];

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      sumupProductId: true,
      barcode: true,
      priceCents: true,
      stock: true,
    },
  });

  const preById = new Map(pre.products.map((p: { id: string }) => [p.id, p]));
  let priceChanged = 0;
  let stockChanged = 0;
  let deleted = 0;
  let barcodeChanged = 0;
  let sumupOverwritten = 0;
  const eanZeroIssues: Array<Record<string, string>> = [];

  for (const old of pre.products) {
    const now = products.find((p) => p.id === old.id);
    if (!now) {
      deleted += 1;
      continue;
    }
    if (now.priceCents !== old.priceCents) priceChanged += 1;
    if (now.stock !== old.stock) stockChanged += 1;
    if ((now.barcode || null) !== (old.barcode || null)) {
      barcodeChanged += 1;
      if (old.barcode && /^0/.test(old.barcode) && now.barcode !== old.barcode) {
        eanZeroIssues.push({
          id: old.id,
          before: old.barcode,
          after: now.barcode || "",
        });
      }
    }
    if (old.sumupProductId && now.sumupProductId && old.sumupProductId !== now.sumupProductId) {
      sumupOverwritten += 1;
    }
  }

  // Duplicate sumupProductId check
  const bySumup = new Map<string, Array<{ id: string; name: string }>>();
  for (const p of products) {
    if (!p.sumupProductId) continue;
    if (!bySumup.has(p.sumupProductId)) bySumup.set(p.sumupProductId, []);
    bySumup.get(p.sumupProductId)!.push({ id: p.id, name: p.name });
  }
  const duplicateSumupIds = [...bySumup.entries()].filter(([, list]) => list.length > 1);

  const applied = journal.filter((j: { refused?: boolean }) => !j.refused);
  const refused = journal.filter((j: { refused?: boolean }) => j.refused);

  const after = {
    count: products.length,
    withSumup: products.filter((p) => p.sumupProductId).length,
    withBarcode: products.filter((p) => p.barcode).length,
    priceSum: products.reduce((a, p) => a + p.priceCents, 0),
    stockSum: products.reduce((a, p) => a + p.stock, 0),
  };

  console.log(
    JSON.stringify(
      {
        before: {
          count: pre.count,
          withSumup: pre.withSumup,
          withBarcode: pre.withBarcode,
          priceSum: pre.priceSum,
          stockSum: pre.stockSum,
        },
        after,
        deltas: {
          count: after.count - pre.count,
          withSumup: after.withSumup - pre.withSumup,
          withBarcode: after.withBarcode - pre.withBarcode,
          priceSum: after.priceSum - pre.priceSum,
          stockSum: after.stockSum - pre.stockSum,
        },
        journalApplied: applied.length,
        journalRefused: refused.length,
        priceChanged,
        stockChanged,
        productsDeleted: deleted,
        barcodeChanged,
        sumupOverwritten,
        eanZeroIssues,
        duplicateSumupIds: duplicateSumupIds.map(([id, list]) => ({
          sumupProductId: id,
          products: list,
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main();
