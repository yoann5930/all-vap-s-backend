import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const outDir = path.resolve("backups/sumup-audit-2026-08-03/pre-apply-exact");
  fs.mkdirSync(outDir, { recursive: true });
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      sumupProductId: true,
      barcode: true,
      priceCents: true,
      stock: true,
      sumupName: true,
      sumupSku: true,
      updatedAt: true,
    },
  });
  const snap = {
    at: new Date().toISOString(),
    count: products.length,
    withSumup: products.filter((p) => p.sumupProductId).length,
    withBarcode: products.filter((p) => p.barcode).length,
    priceSum: products.reduce((a, p) => a + p.priceCents, 0),
    stockSum: products.reduce((a, p) => a + p.stock, 0),
    products,
  };
  fs.writeFileSync(path.join(outDir, "PRODUCTS_SNAPSHOT.json"), JSON.stringify(snap));
  console.log(
    JSON.stringify(
      {
        count: snap.count,
        withSumup: snap.withSumup,
        withBarcode: snap.withBarcode,
        priceSum: snap.priceSum,
        stockSum: snap.stockSum,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main();
