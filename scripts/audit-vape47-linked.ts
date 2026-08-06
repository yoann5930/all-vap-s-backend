import "./load-env";
import prisma from "../lib/prisma";

async function main() {
  const linked = await prisma.product.findMany({
    where: { manufacturer: { slug: "vape-47" } },
    select: {
      name: true,
      range: true,
      productFamily: true,
      productType: true,
      visibleOnline: true,
      catalogStatus: true,
      sumupProductId: true,
      priceCents: true,
      rangeRef: { select: { slug: true } },
    },
    orderBy: { name: "asc" },
  });
  console.log("linked", linked.length);
  for (const p of linked) {
    console.log(
      `- ${p.name} | range=${p.range}/${p.rangeRef?.slug} | fam=${p.productFamily} | ${p.productType} | vis=${p.visibleOnline}`
    );
  }

  // Furiosa eggz by name list from référentiel
  const eggzNames = [
    "Aria",
    "Doom",
    "Falkor",
    "Griffon",
    "Ivy",
    "Juno",
    "Lothar",
    "Nova",
    "Ruby",
    "Ryu",
    "Soko",
    "Ultron",
    "Volta",
  ];
  for (const n of eggzNames) {
    const rows = await prisma.product.findMany({
      where: {
        OR: [
          { name: { equals: n, mode: "insensitive" } },
          { name: { startsWith: n + " ", mode: "insensitive" } },
          { name: { contains: n + " 50", mode: "insensitive" } },
          { name: { contains: "Furiosa Eggz", mode: "insensitive" } },
        ],
        priceCents: { gt: 0 },
      },
      select: { name: true, productFamily: true, brand: true, range: true, sumupProductId: true },
      take: 5,
    });
    if (rows.length) console.log(`eggz? ${n}:`, rows.map((r) => r.name).join(" | "));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
