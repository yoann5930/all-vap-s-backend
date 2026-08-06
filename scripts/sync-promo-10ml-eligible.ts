/**
 * Marque les e-liquides 10 ml publiés comme éligibles à l'offre 5+1.
 * Retire le flag de tout le reste (50/100, DIY…).
 * Aucune écriture SumUp.
 */
import prisma from "../lib/prisma";

function isEliquideCat(category: string): boolean {
  return /e-?liquide|eliquide|05\.e-liquide|06\.e-liquide|09\.e-liquide/i.test(category);
}

async function main() {
  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: true,
      catalogStatus: { in: ["valide", "actif"] },
      OR: [{ productType: "10ml" }, { volumeMl: 10 }],
    },
  });

  let marked = 0;
  for (const p of candidates) {
    if (!isEliquideCat(p.category)) continue;
    const volume = p.volumeMl ?? (p.productType === "10ml" ? 10 : null);
    if (volume !== 10) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        volumeMl: 10,
        productType: p.productType || "10ml",
        promotion10mlEligible: true,
      },
    });
    marked++;
  }

  const cleared = await prisma.product.updateMany({
    where: {
      OR: [
        { promotion10mlEligible: true, volumeMl: { not: 10 }, NOT: { productType: "10ml" } },
        { promotion10mlEligible: true, productType: { in: ["50ml", "100ml", "30ml"] } },
      ],
    },
    data: { promotion10mlEligible: false },
  });

  // Set volumeMl on 50/100 published for clarity (not eligible)
  await prisma.product.updateMany({
    where: { productType: "50ml", volumeMl: null },
    data: { volumeMl: 50 },
  });
  await prisma.product.updateMany({
    where: { productType: "100ml", volumeMl: null },
    data: { volumeMl: 100 },
  });

  console.log(
    JSON.stringify(
      {
        markedEligible10ml: marked,
        clearedNon10ml: cleared.count,
      },
      null,
      2
    )
  );
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(async () => prisma.$disconnect());
