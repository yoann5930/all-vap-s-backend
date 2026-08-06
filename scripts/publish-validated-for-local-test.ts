/**
 * Active visibleOnline UNIQUEMENT pour les 91 produits déjà validés (test local).
 * Ne touche pas aux produits a_verifier / non validés.
 * Ne modifie jamais SumUp.
 */
import prisma from "../lib/prisma";

async function main() {
  const updated = await prisma.product.updateMany({
    where: {
      source: "sumup_import",
      catalogStatus: "valide",
      isActive: true,
    },
    data: { visibleOnline: true },
  });

  // Sécurité : forcer l'invisibilité des non validés
  const locked = await prisma.product.updateMany({
    where: {
      source: "sumup_import",
      catalogStatus: { not: "valide" },
    },
    data: { isActive: false, visibleOnline: false },
  });

  const report = {
    validatedPublished: updated.count,
    nonValidatedLocked: locked.count,
    visibleOnlineAndActive: await prisma.product.count({
      where: { visibleOnline: true, isActive: true },
    }),
    validatedVisible: await prisma.product.count({
      where: { catalogStatus: "valide", visibleOnline: true, isActive: true },
    }),
    sumupInvisible: await prisma.product.count({
      where: { source: "sumup_import", visibleOnline: false },
    }),
    nonValidatedActiveOrVisible: await prisma.product.count({
      where: {
        source: "sumup_import",
        catalogStatus: "a_verifier",
        OR: [{ isActive: true }, { visibleOnline: true }],
      },
    }),
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
