/**
 * Corrige FAIL_SUMUP_LINK sur gammes publiées :
 * Twenty, Letters, Furiosa EGGZ V2, Dragonz.
 * Produits actifs sans sumupProductId → matching SumUp ou désactivation (pas de création inventée).
 */
import prisma from "../lib/prisma";

const RANGES = [
  { mfr: "e-tasty", range: "twenty" },
  { mfr: "e-tasty", range: "letters" },
  { mfr: "vape-47", range: "furiosa-eggz" },
  { mfr: "liquideo", range: "dragonzz-liquideo" },
];

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  const report: Array<Record<string, unknown>> = [];

  for (const target of RANGES) {
    const range = await prisma.productRange.findFirst({
      where: {
        slug: { contains: target.range },
        manufacturer: { slug: target.mfr },
      },
      include: {
        manufacturer: true,
        products: {
          where: { isActive: true, sumupProductId: null },
          select: {
            id: true,
            name: true,
            slug: true,
            visibleOnline: true,
            barcode: true,
            volumeMl: true,
          },
        },
      },
    });

    if (!range) {
      report.push({ target, status: "RANGE_NOT_FOUND" });
      continue;
    }

    console.log(
      `\n=== ${range.manufacturer?.slug}/${range.slug} missing SumUp: ${range.products.length} ===`
    );

    for (const p of range.products) {
      // Chercher un produit SumUp déjà lié ailleurs avec même nom ? Non — chercher dans
      // les produits magasin via name match sur d'autres lignes sumup déjà présentes
      // ou via table si existante. Ici : chercher un autre Product sumup avec nom proche.
      const candidates = await prisma.product.findMany({
        where: {
          sumupProductId: { not: null },
          isActive: true,
          OR: [
            { name: { equals: p.name, mode: "insensitive" } },
            { barcode: p.barcode || undefined },
          ],
        },
        take: 5,
        select: { id: true, name: true, sumupProductId: true, slug: true },
      });

      let linked = false;
      for (const c of candidates) {
        if (!c.sumupProductId) continue;
        // Ne pas voler un ID déjà unique contraint — vérifier unicité
        const clash = await prisma.product.findFirst({
          where: {
            sumupProductId: c.sumupProductId,
            NOT: { id: p.id },
            isActive: true,
          },
        });
        if (clash) continue;
        await prisma.product.update({
          where: { id: p.id },
          data: { sumupProductId: c.sumupProductId },
        });
        report.push({
          product: p.name,
          range: range.slug,
          action: "LINKED_FROM_SIBLING",
          sumupProductId: c.sumupProductId,
        });
        console.log(`  LINK ${p.name} ← ${c.sumupProductId}`);
        linked = true;
        break;
      }

      if (linked) continue;

      // Pas de match fiable → retirer du catalogue actif (pas de SumUp inventé)
      if (p.visibleOnline) {
        await prisma.product.update({
          where: { id: p.id },
          data: { visibleOnline: false },
        });
        report.push({
          product: p.name,
          range: range.slug,
          action: "UNPUBLISH_NO_SUMUP",
        });
        console.log(`  UNPUBLISH ${p.name} (visible sans SumUp — anormal)`);
      } else {
        await prisma.product.update({
          where: { id: p.id },
          data: { isActive: false, catalogStatus: "archive" },
        });
        report.push({
          product: p.name,
          range: range.slug,
          action: "DEACTIVATE_NO_SUMUP",
        });
        console.log(`  DEACTIVATE ${p.name}`);
      }
    }
  }

  console.log("\n", JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
