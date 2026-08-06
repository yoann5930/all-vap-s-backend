import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const slugs = [
    "les-collegues-50ml-la-coquette-9bfd011b",
    "les-collegues-la-mimi-50ml-d870199f",
    "akashi-50ml-kyoto-storm-raneki-liquide-a3ba2f9b",
    "concentre-numbers1-30ml-e-tasty-9962f956",
    "zenko-50ml-kyoto-storm-raneki-liquide-26d06f4c",
  ];
  const rows = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      visibleOnline: true,
      imageUrl: true,
      imageStatus: true,
      sumupProductId: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  const visible = await prisma.product.count({
    where: {
      isActive: true,
      visibleOnline: true,
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml"] } },
        { volumeMl: { in: [10, 30, 50, 70, 100] } },
      ],
    },
  });
  console.log("visibleOnline eliq-ish", visible);
  await prisma.$disconnect();
}
main();
