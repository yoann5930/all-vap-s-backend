import prisma from "../lib/prisma";
import { validateCartStock } from "../lib/stock";

async function main() {
  const zero = await prisma.stockLevel.count({ where: { availableQuantity: { lte: 0 } } });
  const p0 = await prisma.product.findFirst({
    where: { isActive: true, stock: { lte: 0 } },
    select: { id: true, name: true, stock: true, variants: { take: 1, select: { id: true } } },
  });
  let legacyBlock = null;
  if (p0) {
    const r = await validateCartStock([
      { productId: p0.id, variantId: p0.variants[0]?.id, quantity: 1 },
    ]);
    legacyBlock = { productId: p0.id, stock: p0.stock, ok: r.ok, code: r.code, message: r.message };
  }
  // tenter quantité absurde sur produit existant pour prouver garde
  const any = await prisma.stockLevel.findFirst({
    where: { availableQuantity: { gte: 1 } },
    select: { productId: true, variantId: true, availableQuantity: true },
  });
  let overQty = null;
  if (any) {
    const r = await validateCartStock([
      {
        productId: any.productId,
        variantId: any.variantId,
        quantity: any.availableQuantity + 50,
      },
    ]);
    overQty = {
      iteration: "over-qty",
      blocked: !r.ok,
      code: r.code,
      available: any.availableQuantity,
    };
  }

  console.log(
    JSON.stringify(
      {
        zeroLevels: zero,
        legacyBlock,
        overQty,
        leftovers: {
          auditUsers: await prisma.user.count({
            where: { email: { endsWith: "@allvaps-audit.local" } },
          }),
          auditOrders: await prisma.order.count({
            where: { customerEmail: { endsWith: "@allvaps-audit.local" } },
          }),
          testEvents: await prisma.notificationEvent.count({ where: { isTest: true } }),
          testReports: await prisma.managementReport.count({ where: { isTest: true } }),
          testAlerts: await prisma.adminAlert.count({ where: { isTest: true } }),
        },
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
