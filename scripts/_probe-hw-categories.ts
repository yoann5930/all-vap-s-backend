import prisma from "../lib/prisma";

async function main() {
  const byCat = await prisma.product.groupBy({
    by: ["category"],
    where: { isActive: true },
    _count: true,
    orderBy: { _count: { category: "desc" } },
  });
  console.log("categories", byCat.slice(0, 40));

  const types = await prisma.product.groupBy({
    by: ["productType"],
    where: { isActive: true },
    _count: true,
    orderBy: { _count: { productType: "desc" } },
  });
  console.log("types", types.slice(0, 40));

  const hw = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: "batterie", mode: "insensitive" } },
        { name: { contains: "kuix", mode: "insensitive" } },
        { name: { contains: "vaporesso", mode: "insensitive" } },
        { name: { contains: "voopoo", mode: "insensitive" } },
        { name: { contains: "oxva", mode: "insensitive" } },
        { name: { contains: "geekvape", mode: "insensitive" } },
        { name: { contains: "cigarette", mode: "insensitive" } },
        { category: { not: { contains: "liquide" } } },
      ],
    },
    take: 50,
    select: { name: true, category: true, productType: true, sumupProductId: true },
  });
  console.log("hw sample", hw);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
