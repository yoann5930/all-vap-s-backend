/**
 * Vérification finale catalogue e-liquides publiés (images locales + gate).
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

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true, manufacturerId: true } },
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

  const issues: Array<Record<string, unknown>> = [];
  let published = 0;
  let noSumup = 0;
  let noPhoto = 0;
  let brokenImage = 0;
  let gateFailPublished = 0;

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

    if (!p.sumupProductId) noSumup += 1;
    if (gate.reasons.includes("photo_officielle_manquante") && p.sumupProductId) noPhoto += 1;

    if (p.visibleOnline) {
      published += 1;
      if (!gate.canPublishOnline) {
        gateFailPublished += 1;
        issues.push({
          type: "published_gate_fail",
          slug: p.slug,
          reasons: gate.reasons,
        });
      }
      if (p.imageStatus !== "official") {
        issues.push({ type: "published_not_official", slug: p.slug, imageStatus: p.imageStatus });
      }
      if (!p.imageUrl || !p.imageUrl.startsWith("/")) {
        issues.push({ type: "published_image_not_local", slug: p.slug, imageUrl: p.imageUrl });
      } else {
        const abs = path.join(process.cwd(), "public", p.imageUrl.replace(/^\//, ""));
        if (!fs.existsSync(abs)) {
          brokenImage += 1;
          issues.push({ type: "broken_image", slug: p.slug, path: abs });
        }
      }
      if (!p.sumupProductId) {
        issues.push({ type: "published_without_sumup", slug: p.slug });
      }
      if (p.rangeRef && p.manufacturerId && p.rangeRef.manufacturerId !== p.manufacturerId) {
        issues.push({
          type: "manufacturer_range_mismatch",
          slug: p.slug,
          mfr: p.manufacturer?.slug,
          range: p.rangeRef.slug,
        });
      }
    }
  }

  const summary = {
    active: eliquides.length,
    published,
    offline: eliquides.length - published,
    noSumup,
    noPhotoWithSumup: noPhoto,
    brokenImage,
    gateFailPublished,
    issueCount: issues.length,
    issues: issues.slice(0, 50),
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.resolve("data/rebuild/VERIF_FINALE_ELIQUIDES.json"),
    JSON.stringify(summary, null, 2),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
