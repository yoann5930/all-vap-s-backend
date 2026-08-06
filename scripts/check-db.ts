import prisma from "../lib/prisma";

async function main() {
  const count = await prisma.product.count();
  const sample = await prisma.product.findMany({ take: 5, select: { id: true, name: true, barcode: true } });
  console.log(JSON.stringify({ productCount: count, sample }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
