import prisma from "../lib/prisma";

async function main() {
  const [valides, manufacturers, ranges, formats, visible] = await Promise.all([
    prisma.product.count({ where: { catalogStatus: "valide" } }),
    prisma.manufacturer.count(),
    prisma.productRange.count(),
    prisma.catalogFormat.count(),
    prisma.product.count({ where: { catalogStatus: "valide", visibleOnline: true } }),
  ]);
  console.log(JSON.stringify({ valides, manufacturers, ranges, formats, visible }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
