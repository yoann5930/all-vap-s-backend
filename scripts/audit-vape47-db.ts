import "./load-env";
import prisma from "../lib/prisma";

const patterns = [
  "enfer",
  "invapable",
  "furiosa",
  "furioza",
  "d enfer",
  "d'enfer",
  "vape 47",
  "vape47",
];

async function main() {
  for (const p of patterns) {
    const rows = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: p, mode: "insensitive" } },
          { brand: { contains: p, mode: "insensitive" } },
          { range: { contains: p, mode: "insensitive" } },
          { productFamily: { contains: p, mode: "insensitive" } },
        ],
      },
      select: {
        name: true,
        priceCents: true,
        productType: true,
        sumupProductId: true,
        barcode: true,
        visibleOnline: true,
        catalogStatus: true,
        imageStatus: true,
        stock: true,
      },
      orderBy: { name: "asc" },
      take: 60,
    });
    console.log(`\n=== ${p} (${rows.length}) ===`);
    for (const r of rows.slice(0, 20)) {
      console.log(
        `- ${r.name} | ${r.productType} | ${r.priceCents}c | vis=${r.visibleOnline} | ${r.catalogStatus} | img=${r.imageStatus}`
      );
    }
    if (rows.length > 20) console.log(`  ... +${rows.length - 20}`);
  }

  const m = await prisma.manufacturer.findUnique({
    where: { slug: "vape-47" },
    include: {
      ranges: { select: { slug: true, name: true, isActive: true } },
      brands: { select: { slug: true, name: true } },
      _count: { select: { products: true } },
    },
  });
  console.log("\nmanufacturer", JSON.stringify(m, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
