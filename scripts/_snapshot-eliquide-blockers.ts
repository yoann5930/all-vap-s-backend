/** Snapshot eliquide publish stats + manufacturer photo blockers */
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";

async function main() {
  const mfrFilter = process.argv[2] || null;
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true } },
    },
  });
  const eliquides = products.filter((p) =>
    isEliquideProduct({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      name: p.name,
    }),
  );

  let published = 0;
  let noSumup = 0;
  let noPhoto = 0;
  const byMfr = new Map<string, Array<{ name: string; slug: string; range: string | null; reasons: string[] }>>();

  for (const p of eliquides) {
    const gate = evaluateEliquidePublishGate({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      name: p.name,
      sumupName: p.sumupName,
      sumupProductId: p.sumupProductId,
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      sumupMapping: p.sumupMapping,
      nameProvenance: parseNameProvenance(p.sumupMapping),
    });
    if (p.visibleOnline) published += 1;
    if (!p.sumupProductId) noSumup += 1;
    else if (gate.reasons.includes("photo_officielle_manquante")) {
      noPhoto += 1;
      const slug = p.manufacturer?.slug || "_none";
      if (!byMfr.has(slug)) byMfr.set(slug, []);
      byMfr.get(slug)!.push({
        name: p.name,
        slug: p.slug,
        range: p.rangeRef?.slug ?? null,
        reasons: gate.reasons,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        active: eliquides.length,
        published,
        offline: eliquides.length - published,
        noSumup,
        noPhotoWithSumup: noPhoto,
        byManufacturer: Object.fromEntries(
          [...byMfr.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([k, v]) => [k, { count: v.length, items: v }]),
        ),
      },
      null,
      2,
    ),
  );

  if (mfrFilter) {
    const items = byMfr.get(mfrFilter) || [];
    console.log("\n=== FILTER", mfrFilter, items.length, "===");
    for (const i of items) console.log(`- [${i.range}] ${i.name} (${i.slug})`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
