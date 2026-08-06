import prisma from "../lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      productType: "20ml",
      range: "Twenty",
      visibleOnline: true,
      isActive: true,
    },
    select: { name: true, slug: true, catalogStatus: true, brand: true, category: true },
    orderBy: { name: "asc" },
  });
  console.log(JSON.stringify(products, null, 2));
}

main().finally(() => prisma.$disconnect());
