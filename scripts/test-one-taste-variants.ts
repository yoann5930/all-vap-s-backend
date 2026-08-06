/**
 * Vérifie le regroupement nicotine One Taste 10 ml.
 * Run: npx tsx scripts/test-one-taste-variants.ts
 */
import prisma from "../lib/prisma";

async function main() {
  let failed = 0;
  const ok = (c: boolean, msg: string) => {
    if (c) console.log("OK ", msg);
    else {
      failed++;
      console.error("FAIL", msg);
    }
  };

  const ananas = await prisma.product.findFirst({
    where: { slug: "one-taste-ananas-10ml", visibleOnline: true },
    include: {
      variants: { where: { active: true }, orderBy: { nicotineMg: "asc" } },
    },
  });
  ok(!!ananas, "fiche Ananas publique existe");
  ok(!/\b\d+\s*mg\b/i.test(ananas?.name || ""), "titre Ananas sans dosage");
  const mgs = (ananas?.variants || []).map((v) => v.nicotineMg);
  ok(JSON.stringify(mgs) === JSON.stringify([0, 3, 6, 12]), `dosages Ananas = 0,3,6,12 (got ${mgs})`);
  ok(
    (ananas?.variants || []).every(
      (v) => v.sumupProductId && v.barcode && (v.priceCents ?? 0) > 0
    ),
    "chaque variante Ananas a SumUp + EAN + prix"
  );

  const publicDosageNamed = await prisma.product.count({
    where: {
      productFamily: "ETASTY_ONE_TASTE",
      productType: "10ml",
      visibleOnline: true,
      isActive: true,
      name: { contains: "mg", mode: "insensitive" },
    },
  });
  // Filtre plus strict
  const visible10 = await prisma.product.findMany({
    where: {
      productFamily: "ETASTY_ONE_TASTE",
      productType: "10ml",
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
    },
    select: { name: true, slug: true, _count: { select: { variants: true } } },
  });
  const withMg = visible10.filter((p) => /\b\d+\s*mg\b/i.test(p.name));
  ok(withMg.length === 0, `0 fiche 10ml publique avec mg dans le titre (got ${withMg.length})`);
  ok(visible10.length >= 40, `au moins 40 saveurs 10ml publiées (got ${visible10.length})`);

  const oldAnanas = await prisma.product.count({
    where: {
      slug: { startsWith: "ananas-10ml-" },
      visibleOnline: true,
    },
  });
  ok(oldAnanas === 0, "anciennes fiches Ananas XXmg non publiques");

  console.log(`\n${visible10.length} saveurs 10ml | fails=${failed}`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
