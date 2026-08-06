/**
 * Publie en ligne TOUS les e-liquides qui passent déjà le gate officiel
 * (SumUp + photo officielle + prix). N'invente aucun ID SumUp / photo.
 *
 * Usage:
 *   npx tsx scripts/publish-all-gate-ready-eliquides.ts         # dry-run
 *   npx tsx scripts/publish-all-gate-ready-eliquides.ts --apply # écrit DB
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/RAPPORT_PUBLISH_GATE_READY.json");

async function main() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { category: { equals: "e-liquides" } },
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
      sumupName: true,
      sumupProductId: true,
      sumupMapping: true,
      imageStatus: true,
      imageUrl: true,
      priceCents: true,
      visibleOnline: true,
      catalogStatus: true,
      rangeId: true,
    },
  });

  const eliquides = products.filter((p) =>
    isEliquideProduct({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
    }),
  );

  const toPublish: Array<Record<string, unknown>> = [];
  const blocked: Record<string, number> = {};
  let alreadyOnline = 0;

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

    if (gate.canPublishOnline) {
      if (p.visibleOnline) {
        alreadyOnline += 1;
        continue;
      }
      toPublish.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        sumupProductId: p.sumupProductId,
      });
      continue;
    }

    const key = gate.reasons[0] || gate.anomalies[0] || "unknown";
    blocked[key] = (blocked[key] || 0) + 1;
  }

  // Also ensure ranges for published products are catalogVisible if OFFICIAL_CONFIRMED
  const rangeIds = [
    ...new Set(
      eliquides
        .filter((p) => p.rangeId && (p.visibleOnline || toPublish.some((t) => t.id === p.id)))
        .map((p) => p.rangeId as string),
    ),
  ];

  let rangesTouched = 0;
  if (APPLY && toPublish.length) {
    for (const row of toPublish) {
      await prisma.product.update({
        where: { id: row.id as string },
        data: {
          visibleOnline: true,
          catalogStatus: "valide",
          importAnomaly: null,
          sumupLastSync: new Date(),
        },
      });
    }
  }

  if (APPLY && rangeIds.length) {
    const res = await prisma.productRange.updateMany({
      where: {
        id: { in: rangeIds },
        verificationStatus: "OFFICIAL_CONFIRMED",
        catalogVisible: false,
      },
      data: { catalogVisible: true },
    });
    rangesTouched = res.count;
  }

  const afterVisible = await prisma.product.count({
    where: {
      isActive: true,
      visibleOnline: true,
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml"] } },
        { volumeMl: { in: [10, 30, 50, 70, 100] } },
      ],
    },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    totalEliquidesActive: eliquides.length,
    alreadyOnline,
    newlyPublishable: toPublish.length,
    publishedNow: APPLY ? toPublish.length : 0,
    rangesCatalogVisibleEnabled: rangesTouched,
    visibleOnlineAfter: afterVisible,
    blockedByReason: blocked,
    sampleToPublish: toPublish.slice(0, 20),
    note:
      "Les produits sans SumUp / photo officielle / prix restent hors ligne (politique officielle).",
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`→ ${REPORT}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
