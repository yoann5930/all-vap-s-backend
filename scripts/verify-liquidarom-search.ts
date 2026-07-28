import prisma from "../lib/prisma";

const queries = [
  "Liquidarom",
  "Ice Cool",
  "Cassis Citron",
  "Mangue Passion",
  "Blackberry Raspberry",
];

async function main() {
  for (const s of queries) {
    const n = await prisma.product.count({
      where: {
        isActive: true,
        OR: [
          { name: { contains: s, mode: "insensitive" } },
          { brand: { contains: s, mode: "insensitive" } },
          { description: { contains: s, mode: "insensitive" } },
        ],
      },
    });
    console.log(`${s}: ${n}`);
  }
  const total = await prisma.product.count({
    where: { brand: { equals: "Liquidarom", mode: "insensitive" }, isActive: true },
  });
  console.log(`TOTAL Liquidarom actifs: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
