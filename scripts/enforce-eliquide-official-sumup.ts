/**
 * Applique la politique e-liquides : SumUp + photo officielle + nom non inventé.
 *
 * Usage:
 *   npx tsx scripts/enforce-eliquide-official-sumup.ts           # dry-run
 *   npx tsx scripts/enforce-eliquide-official-sumup.ts --apply   # écrit DB
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
const REPORT = path.resolve("data/rebuild/RAPPORT_ENFORCE_ELIQUIDE_OFFICIAL.json");

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
      importAnomaly: true,
    },
  });

  const eliquides = products.filter((p) =>
    isEliquideProduct({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
    })
  );

  const actions: Array<Record<string, unknown>> = [];
  let unpublished = 0;
  let renamed = 0;
  let alreadyOk = 0;
  let offlineOk = 0;

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

    const safeName = gate.safeDisplayName;
    const needRename = Boolean(safeName && safeName !== p.name);
    const shouldBeOnline = gate.canPublishOnline;
    const needUnpublish = p.visibleOnline && !shouldBeOnline;

    if (!needRename && !needUnpublish) {
      if (p.visibleOnline) alreadyOk += 1;
      else offlineOk += 1;
      continue;
    }

    const nextAnomaly = shouldBeOnline
      ? null
      : gate.anomalies.join("|") || "a_verifier_officiel_sumup";

    actions.push({
      id: p.id,
      slug: p.slug,
      wasOnline: p.visibleOnline,
      nameBefore: p.name,
      nameAfter: safeName || p.name,
      sumupName: p.sumupName,
      reasons: gate.reasons,
      anomalies: gate.anomalies,
      needRename,
      needUnpublish,
      willBeOnline: shouldBeOnline,
    });

    if (!APPLY) continue;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        ...(needRename && safeName ? { name: safeName } : {}),
        visibleOnline: shouldBeOnline,
        catalogStatus: shouldBeOnline ? "valide" : "a_verifier",
        importAnomaly: nextAnomaly,
        sumupLastSync: new Date(),
      },
    });
    if (needRename) renamed += 1;
    if (needUnpublish) unpublished += 1;
  }

  const report = {
    date: new Date().toISOString(),
    apply: APPLY,
    policy: "lib/catalog/official-sumup-policy.ts",
    scanned: eliquides.length,
    alreadyOkOnline: alreadyOk,
    alreadyOffline: offlineOk,
    actionsCount: actions.length,
    renamedApplied: APPLY ? renamed : 0,
    unpublishedApplied: APPLY ? unpublished : 0,
    wouldRename: actions.filter((a) => a.needRename).length,
    wouldUnpublish: actions.filter((a) => a.needUnpublish).length,
    actions: actions.slice(0, 500),
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        scanned: eliquides.length,
        wouldRename: report.wouldRename,
        wouldUnpublish: report.wouldUnpublish,
        alreadyOkOnline: alreadyOk,
        report: REPORT,
        hint: APPLY
          ? "Modifications appliquées"
          : "Dry-run — relancer avec --apply pour écrire en base",
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
