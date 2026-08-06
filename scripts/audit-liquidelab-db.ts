import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const patterns = ["glagla", "kuix", "iceberg", "gourmand", "peche gourmand", "péché"];
  for (const p of patterns) {
    const rows = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: p, mode: "insensitive" } },
          { slug: { contains: p, mode: "insensitive" } },
          { brand: { contains: p, mode: "insensitive" } },
          { range: { contains: p, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        brand: true,
        range: true,
        productType: true,
        priceCents: true,
        sumupProductId: true,
        barcode: true,
        imageUrl: true,
        imageStatus: true,
        visibleOnline: true,
        catalogStatus: true,
        stock: true,
        manufacturerId: true,
        rangeId: true,
      },
      take: 80,
    });
    console.log(`\n=== ${p} (${rows.length}) ===`);
    for (const r of rows.slice(0, 12)) {
      console.log(
        `- ${r.name} | ${r.productType} | ${r.priceCents}c | img=${r.imageStatus} | vis=${r.visibleOnline} | ${r.catalogStatus} | sumup=${Boolean(r.sumupProductId)}`
      );
    }
    if (rows.length > 12) console.log(`  ... +${rows.length - 12}`);
  }

  const m = await prisma.manufacturer.findUnique({
    where: { slug: "liquide-lab" },
    include: {
      ranges: { select: { slug: true, name: true, isActive: true } },
      brands: { select: { slug: true, name: true } },
      _count: { select: { products: true } },
    },
  });
  console.log("\nmanufacturer:", JSON.stringify(m, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
