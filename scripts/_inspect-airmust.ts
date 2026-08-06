import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const m = await prisma.manufacturer.findFirst({
    where: { slug: "airmust" },
    include: { ranges: { select: { slug: true, name: true } } },
  });
  const products = await prisma.product.findMany({
    where: { manufacturer: { slug: "airmust" }, isActive: true },
    select: {
      name: true,
      slug: true,
      visibleOnline: true,
      imageStatus: true,
      imageUrl: true,
      sumupProductId: true,
      volumeMl: true,
      rangeRef: { select: { slug: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const byRange = new Map<string, number>();
  for (const p of products) {
    const k = p.rangeRef?.slug || "_none";
    byRange.set(k, (byRange.get(k) || 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        manufacturer: m?.name,
        ranges: m?.ranges,
        total: products.length,
        published: products.filter((p) => p.visibleOnline).length,
        offline: products.filter((p) => !p.visibleOnline).length,
        officialImg: products.filter((p) => p.imageStatus === "official").length,
        byRange: Object.fromEntries(byRange),
        offline: products
          .filter((p) => !p.visibleOnline)
          .map((p) => ({
            name: p.name,
            slug: p.slug,
            range: p.rangeRef?.slug,
            sumup: !!p.sumupProductId,
            imageStatus: p.imageStatus,
            volumeMl: p.volumeMl,
          })),
        published: products
          .filter((p) => p.visibleOnline)
          .map((p) => ({
            name: p.name,
            range: p.rangeRef?.slug,
            img: p.imageUrl,
          })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main();
