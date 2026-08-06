import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "Kuix", mode: "insensitive" } },
        { range: { equals: "Kuix", mode: "insensitive" } },
        { productFamily: "LIQUIDELAB_KUIX" },
        { rangeRef: { slug: "kuix" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      productType: true,
      volumeMl: true,
      priceCents: true,
      barcode: true,
      sumupProductId: true,
      imageUrl: true,
      imageStatus: true,
      visibleOnline: true,
      catalogStatus: true,
      stock: true,
    },
    orderBy: { name: "asc" },
  });
  console.log("kuix_count", rows.length);
  for (const r of rows) {
    console.log(
      JSON.stringify({
        name: r.name,
        cat: r.category,
        type: r.productType,
        ml: r.volumeMl,
        price: r.priceCents,
        vis: r.visibleOnline,
        img: r.imageStatus,
        url: r.imageUrl,
        sumup: Boolean(r.sumupProductId),
        ean: r.barcode,
      })
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
