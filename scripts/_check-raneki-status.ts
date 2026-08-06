import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { manufacturer: { slug: "raneki-liquide" } },
        { slug: { contains: "aphrodite" } },
        { slug: { contains: "hades" } },
        { slug: { contains: "pastis-13" } },
        { slug: { contains: "zombie" } },
      ],
      isActive: true,
    },
    select: {
      name: true,
      slug: true,
      visibleOnline: true,
      imageStatus: true,
      imageUrl: true,
      sumupProductId: true,
      volumeMl: true,
      manufacturer: { select: { slug: true } },
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main();
