/**
 * Supprime définitivement les doublons Ice Cool déjà quarantainés
 * (pas de SumUp, stock 0, inactifs, anomaly ice_cool_dedupe).
 *
 * Usage:
 *   npx tsx scripts/purge-quarantined-ice-cool-dupes.ts --dry-run
 *   npx tsx scripts/purge-quarantined-ice-cool-dupes.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/PURGE_ICE_COOL_DUPES.json");

async function main() {
  const candidates = await prisma.product.findMany({
    where: {
      isActive: false,
      visibleOnline: false,
      sumupProductId: null,
      stock: 0,
      importAnomaly: { contains: "ice_cool_dedupe" },
      OR: [
        { name: { contains: "Ice Cool", mode: "insensitive" } },
        { productFamily: { in: ["ICE_COOL", "ICE_COOL_X"] } },
      ],
    },
    select: {
      id: true,
      name: true,
      importAnomaly: true,
      stockLevels: { select: { id: true, quantity: true } },
      inventoryLines: { select: { id: true } },
      _count: {
        select: {
          stockMovements: true,
          orderItems: true,
          reviews: true,
        },
      },
    },
  });

  const deletable = [];
  const blocked = [];
  for (const p of candidates) {
    const levelQty = p.stockLevels.reduce((s, l) => s + l.quantity, 0);
    const reason =
      levelQty > 0
        ? "stock_level"
        : p.inventoryLines.length
          ? "inventory_lines"
          : p._count.stockMovements
            ? "stock_movements"
            : p._count.orderItems
              ? "orders"
              : null;
    if (reason) blocked.push({ id: p.id, name: p.name, reason });
    else deletable.push({ id: p.id, name: p.name, anomaly: p.importAnomaly });
  }

  const report = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    deletable,
    blocked,
  };

  if (APPLY) {
    for (const p of deletable) {
      await prisma.productImage.deleteMany({ where: { productId: p.id } });
      await prisma.productVariant.deleteMany({ where: { productId: p.id } });
      await prisma.productFlavor.deleteMany({ where: { productId: p.id } }).catch(() => null);
      await prisma.productAvaMeta.deleteMany({ where: { productId: p.id } }).catch(() => null);
      await prisma.stockLevel.deleteMany({ where: { productId: p.id } });
      // SetNull relations already OK
      await prisma.product.delete({ where: { id: p.id } });
    }
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        deleted: deletable.length,
        blocked: blocked.length,
        sample: deletable.slice(0, 5),
        report: REPORT,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
