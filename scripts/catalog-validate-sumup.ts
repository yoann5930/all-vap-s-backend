/**
 * Valide liens SumUp (unicité + présence sur produits visibles e-liquides).
 */
import prisma from "../lib/prisma";

async function main() {
  const issues: string[] = [];

  const dupes = await prisma.$queryRaw<Array<{ sumupProductId: string; c: bigint }>>`
    SELECT "sumupProductId", COUNT(*)::bigint AS c
    FROM "Product"
    WHERE "sumupProductId" IS NOT NULL AND "isActive" = true
    GROUP BY "sumupProductId"
    HAVING COUNT(*) > 1
  `;
  for (const d of dupes) {
    issues.push(`DUPLICATE_SUMUP ${d.sumupProductId} x${d.c}`);
  }

  const visibleWithoutSumup = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: true,
      catalogStatus: { in: ["valide", "actif"] },
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml", "e-liquide"] } },
      ],
      sumupProductId: null,
    },
    select: { id: true, name: true, slug: true },
    take: 50,
  });
  for (const p of visibleWithoutSumup) {
    issues.push(`VISIBLE_WITHOUT_SUMUP ${p.slug} (${p.name})`);
  }

  const slugDupes = await prisma.$queryRaw<Array<{ slug: string; c: bigint }>>`
    SELECT slug, COUNT(*)::bigint AS c
    FROM "Product"
    WHERE "isActive" = true
    GROUP BY slug
    HAVING COUNT(*) > 1
  `;
  for (const d of slugDupes) {
    issues.push(`DUPLICATE_SLUG ${d.slug} x${d.c}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: issues.length === 0,
        duplicateSumup: dupes.length,
        visibleWithoutSumup: visibleWithoutSumup.length,
        duplicateSlug: slugDupes.length,
        issues,
      },
      null,
      2
    )
  );
  process.exit(issues.length === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
