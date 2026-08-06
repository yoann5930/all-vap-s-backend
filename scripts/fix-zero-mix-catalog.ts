/**
 * Corrections auto zéro-mélange.
 * - Dépublie les visibles hors gate / sans rangeId / mix fabricant
 * - Aligne manufacturerId sur la gamme si mix détecté (source = gamme)
 * - Coupe les images partagées entre fabricants (sauf même fichier légitime mono-mfr)
 *
 * Usage:
 *   npx tsx scripts/fix-zero-mix-catalog.ts
 *   npx tsx scripts/fix-zero-mix-catalog.ts --apply
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
const OUT = path.resolve("data/rebuild/FIX_ZERO_MIX.json");

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      manufacturerId: true,
      brandId: true,
      rangeId: true,
      imageUrl: true,
      imageStatus: true,
      visibleOnline: true,
      isActive: true,
      category: true,
      productType: true,
      volumeMl: true,
      sumupName: true,
      sumupProductId: true,
      sumupMapping: true,
      priceCents: true,
      catalogStatus: true,
      importAnomaly: true,
      brand: { select: { manufacturerId: true } },
      rangeRef: {
        select: { id: true, manufacturerId: true, slug: true },
      },
    },
  });

  const actions: Array<Record<string, unknown>> = [];
  let unpublished = 0;
  let alignedManufacturer = 0;
  let clearedSharedImage = 0;
  let brandCleared = 0;

  // Shared images across manufacturers
  const byImage = new Map<string, typeof products>();
  for (const p of products.filter(
    (x) => x.isActive && x.imageUrl?.startsWith("/media/"),
  )) {
    const k = p.imageUrl!;
    if (!byImage.has(k)) byImage.set(k, []);
    byImage.get(k)!.push(p);
  }
  const sharedUrls = new Set<string>();
  for (const [url, list] of byImage) {
    const mfrs = new Set(list.map((x) => x.manufacturerId).filter(Boolean));
    if (mfrs.size > 1) sharedUrls.add(url);
  }

  for (const p of products.filter((x) => x.isActive)) {
    const data: Record<string, unknown> = {};
    const reasons: string[] = [];

    // Mix range → align product manufacturer to range manufacturer
    if (
      p.rangeRef?.manufacturerId &&
      p.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    ) {
      data.manufacturerId = p.rangeRef.manufacturerId;
      reasons.push("align_manufacturer_to_range");
      alignedManufacturer += 1;
    }

    // Mix brand → clear brand link (safer than guessing)
    if (
      p.brand?.manufacturerId &&
      (data.manufacturerId || p.manufacturerId) &&
      p.brand.manufacturerId !== (data.manufacturerId || p.manufacturerId)
    ) {
      data.brandId = null;
      reasons.push("clear_brand_wrong_manufacturer");
      brandCleared += 1;
    }

    // Shared image across manufacturers → clear + unpublish
    if (p.imageUrl && sharedUrls.has(p.imageUrl)) {
      data.imageUrl = null;
      data.imageStatus = "pending";
      reasons.push("clear_shared_image_across_manufacturers");
      clearedSharedImage += 1;
    }

    const nextVisible = p.visibleOnline;
    let shouldOnline = nextVisible;

    if (p.visibleOnline) {
      if (!p.rangeId && !data.rangeId) {
        shouldOnline = false;
        reasons.push("unpublish_no_range_id");
      }

      const mfrId = (data.manufacturerId as string) || p.manufacturerId;
      if (!mfrId) {
        shouldOnline = false;
        reasons.push("unpublish_no_manufacturer");
      }

      if (
        isEliquideProduct({
          category: p.category,
          productType: p.productType,
          volumeMl: p.volumeMl,
        })
      ) {
        const gate = evaluateEliquidePublishGate({
          category: p.category,
          productType: p.productType,
          volumeMl: p.volumeMl,
          name: p.name,
          sumupName: p.sumupName,
          sumupProductId: p.sumupProductId,
          imageStatus: (data.imageStatus as string) ?? p.imageStatus,
          imageUrl: (data.imageUrl as string | null) ?? p.imageUrl,
          priceCents: p.priceCents,
          sumupMapping: p.sumupMapping,
          nameProvenance: parseNameProvenance(p.sumupMapping),
        });
        if (!gate.canPublishOnline) {
          shouldOnline = false;
          reasons.push(`unpublish_gate:${gate.reasons[0] || "fail"}`);
        }
      }
    }

    if (shouldOnline !== p.visibleOnline) {
      data.visibleOnline = shouldOnline;
      if (!shouldOnline) {
        data.catalogStatus = "a_verifier";
        data.importAnomaly = reasons.join("|");
        unpublished += 1;
      }
    }

    if (Object.keys(data).length === 0) continue;

    actions.push({
      id: p.id,
      slug: p.slug,
      reasons,
      data,
    });

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: data as never,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    actions: actions.length,
    unpublished,
    alignedManufacturer,
    brandCleared,
    clearedSharedImage,
    sharedImageUrls: [...sharedUrls].slice(0, 50),
    sample: actions.slice(0, 40),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, sample: report.sample.slice(0, 10) }, null, 2));
  console.log(`→ ${OUT}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
