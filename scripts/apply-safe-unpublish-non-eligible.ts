import prisma from "../lib/prisma";
import { manufacturerBannerOrLogoIfExists } from "../lib/catalog/manufacturer-logo.server";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";

async function main() {
  // Unpublish products that are visible but NOT on an eligible confirmed range
  const products = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
      manufacturerId: { not: null },
    },
    select: {
      id: true,
      name: true,
      manufacturerId: true,
      rangeId: true,
      manufacturer: { select: { slug: true } },
      rangeRef: {
        select: {
          slug: true,
          verificationStatus: true,
          catalogVisible: true,
          status: true,
        },
      },
    },
  });

  let unpublished = 0;
  const samples: string[] = [];
  for (const p of products) {
    const mSlug = p.manufacturer?.slug;
    if (!mSlug) continue;
    const r = p.rangeRef;
    const ok =
      r &&
      rangeCoverUrl(mSlug, r.slug) &&
      isRangeCatalogEligible(
        readRangeOfficialGate(r as unknown as Record<string, unknown>)
      );
    if (ok) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { visibleOnline: false, catalogStatus: "a_verifier" },
    });
    unpublished += 1;
    if (samples.length < 20) samples.push(`${mSlug}: ${p.name}`);
  }

  // Hub simulation
  const mfrs = await prisma.manufacturer.findMany({
    where: { isActive: true, status: { in: ["verifie", "partiel"] } },
    include: {
      ranges: {
        where: { isActive: true },
        include: {
          products: {
            where: {
              visibleOnline: true,
              isActive: true,
              catalogStatus: { in: ["valide", "actif"] },
            },
            select: { id: true },
          },
        },
      },
    },
  });
  const publishable = mfrs.filter((m) => {
    if (!manufacturerBannerOrLogoIfExists(m.slug)) return false;
    return m.ranges.some((r) => {
      if (!r.products.length) return false;
      if (!rangeCoverUrl(m.slug, r.slug)) return false;
      return isRangeCatalogEligible(
        readRangeOfficialGate(r as unknown as Record<string, unknown>)
      );
    });
  });

  console.log(
    JSON.stringify(
      {
        unpublished,
        samples,
        publishableCount: publishable.length,
        publishable: publishable.map((m) => m.slug).sort(),
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
