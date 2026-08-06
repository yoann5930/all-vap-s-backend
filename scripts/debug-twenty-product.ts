import prisma from "../lib/prisma";

async function main() {
  const slug = "twenty-double-peche-20ml";
  const prod = await prisma.product.findFirst({
    where: { slug },
    include: {
      manufacturer: true,
      rangeRef: true,
      brandRef: true,
      categoryRef: true,
      variants: true,
      flavors: true,
      stockLevels: { take: 5 },
      catalogImages: true,
      avaMeta: true,
    },
  });

  if (!prod) {
    const like = await prisma.product.findMany({
      where: {
        OR: [
          { slug: { contains: "peche" } },
          { slug: { contains: "twenty" } },
          { name: { contains: "PECHE", mode: "insensitive" } },
          { name: { contains: "Twenty", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        visibleOnline: true,
        catalogStatus: true,
        category: true,
        productType: true,
        brand: true,
        range: true,
        volumeMl: true,
        importAnomaly: true,
      },
      take: 30,
    });
    console.log("NOT_FOUND", JSON.stringify(like, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          id: prod.id,
          slug: prod.slug,
          name: prod.name,
          isActive: prod.isActive,
          visibleOnline: prod.visibleOnline,
          catalogStatus: prod.catalogStatus,
          category: prod.category,
          productType: prod.productType,
          brand: prod.brand,
          range: prod.range,
          volumeMl: prod.volumeMl,
          manufacturer: prod.manufacturer?.name,
          rangeRef: prod.rangeRef?.name,
          categoryRef: prod.categoryRef?.name,
          variants: prod.variants.map((v) => ({
            name: v.name,
            nic: v.nicotineMg,
            stock: v.stock,
            active: v.active,
          })),
          stockLevelsCount: prod.stockLevels.length,
          flavorsCount: prod.flavors.length,
          importAnomaly: prod.importAnomaly,
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
