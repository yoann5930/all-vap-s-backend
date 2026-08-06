import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const products = await prisma.product.count();
  const withSumup = await prisma.product.count({ where: { sumupProductId: { not: null } } });
  const withStock = await prisma.product.count({ where: { stock: { gt: 0 } } });
  const levels = await prisma.stockLevel.count();
  const levelsSum = await prisma.stockLevel.aggregate({ _sum: { quantity: true } });
  const productStockSum = await prisma.product.aggregate({ _sum: { stock: true } });
  console.log(
    JSON.stringify(
      {
        products,
        withSumupId: withSumup,
        productsWithStockGt0: withStock,
        stockLevels: levels,
        stockLevelQtySum: levelsSum._sum.quantity,
        productStockSum: productStockSum._sum.stock,
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
