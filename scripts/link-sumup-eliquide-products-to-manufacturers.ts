/**
 * Rattache les produits locaux aux fabricants détectés SumUp (barcode / nom),
 * sans inventer de liens ambigus.
 *
 * Usage: npx tsx scripts/link-sumup-eliquide-products-to-manufacturers.ts
 */
import {
  analyzeSumUpEliquideManufacturers,
} from "../lib/catalog/sumup-eliquide-manufacturers";
import prisma from "../lib/prisma";
import { normalizeProductName } from "../lib/catalog/normalize";

async function main() {
  const analysis = analyzeSumUpEliquideManufacturers();
  const linked = analysis.productLinks.filter(
    (p) => p.status === "LINKED" && p.manufacturerSlug
  );

  const mfrBySlug = new Map(
    (
      await prisma.manufacturer.findMany({
        select: { id: true, slug: true, name: true },
      })
    ).map((m) => [m.slug, m])
  );
  const brandBySlug = new Map(
    (
      await prisma.brand.findMany({
        select: { id: true, slug: true, manufacturerId: true },
      })
    ).map((b) => [b.slug, b])
  );

  let byBarcode = 0;
  let byName = 0;
  let skipped = 0;
  let missingMfr = 0;

  for (const row of linked) {
    const mfr = mfrBySlug.get(row.manufacturerSlug!);
    if (!mfr) {
      missingMfr += 1;
      continue;
    }
    const brand = brandBySlug.get(row.manufacturerSlug!);

    let product =
      row.barcode
        ? await prisma.product.findFirst({
            where: { barcode: row.barcode },
            select: { id: true, manufacturerId: true, brandId: true, name: true },
          })
        : null;

    if (!product) {
      const nn = normalizeProductName(row.name);
      const candidates = await prisma.product.findMany({
        where: { normalizedName: nn },
        select: { id: true, manufacturerId: true, brandId: true, name: true },
        take: 3,
      });
      if (candidates.length !== 1) {
        skipped += 1;
        continue;
      }
      product = candidates[0]!;
      byName += 1;
    } else {
      byBarcode += 1;
    }

    // Ne pas écraser un rattachement fabricant déjà différent (ambiguïté)
    if (
      product.manufacturerId &&
      product.manufacturerId !== mfr.id
    ) {
      skipped += 1;
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        manufacturerId: mfr.id,
        brandId: brand?.id ?? product.brandId,
        brand: mfr.name,
      },
    });
  }

  // Stats filtres
  const withMfr = await prisma.product.count({
    where: { manufacturerId: { not: null } },
  });
  const eliquideCats = await prisma.product.count({
    where: {
      manufacturerId: { not: null },
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { category: { contains: "E-liquide", mode: "insensitive" } },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        linkedCandidates: linked.length,
        byBarcode,
        byName,
        skipped,
        missingMfr,
        productsWithManufacturer: withMfr,
        productsManufacturerAndEliquideCategory: eliquideCats,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
