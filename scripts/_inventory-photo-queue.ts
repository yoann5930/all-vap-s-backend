import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml"] } },
        { volumeMl: { in: [10, 30, 50, 70, 100] } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      productType: true,
      volumeMl: true,
      sumupProductId: true,
      sumupName: true,
      sumupMapping: true,
      imageUrl: true,
      imageStatus: true,
      priceCents: true,
      visibleOnline: true,
      manufacturerId: true,
      rangeId: true,
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true } },
    },
  });

  const eliq = products.filter((p) => isEliquideProduct(p));
  const byReason: Record<string, number> = {};
  const photoQueue: Array<Record<string, unknown>> = [];
  let visible = 0;
  let readyUnpublished = 0;

  for (const p of eliq) {
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
    if (gate.canPublishOnline) {
      if (p.visibleOnline) visible += 1;
      else readyUnpublished += 1;
      continue;
    }
    const r = gate.reasons[0] || "unknown";
    byReason[r] = (byReason[r] || 0) + 1;
    photoQueue.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      mfr: p.manufacturer?.slug,
      range: p.rangeRef?.slug,
      hasSumup: Boolean(p.sumupProductId),
      hasRange: Boolean(p.rangeId),
      hasMfr: Boolean(p.manufacturerId),
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      reasons: gate.reasons,
      priceCents: p.priceCents,
    });
  }

  const mfrCounts: Record<string, number> = {};
  for (const b of photoQueue) {
    const m = String(b.mfr || "?");
    mfrCounts[m] = (mfrCounts[m] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        total: eliq.length,
        visible,
        readyUnpublished,
        blocked: photoQueue.length,
        byReason,
        byManufacturer: mfrCounts,
        withSumupAndPhotoIssue: photoQueue.filter(
          (b) =>
            b.hasSumup &&
            String((b.reasons as string[])?.[0] || "").includes("photo"),
        ).length,
        samplePhotoBlocked: photoQueue
          .filter((b) =>
            String((b.reasons as string[]).join(" ")).includes("photo"),
          )
          .slice(0, 20),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
