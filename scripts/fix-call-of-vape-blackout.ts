/**
 * Corrige Call of Vape / Blackout :
 * - crée ProductCollection Blackout sous Call of Vape
 * - rattache les produits Blackout
 * - désactive toute fausse gamme indépendante call-of-vape-blackout*
 *
 * Usage: npx tsx scripts/fix-call-of-vape-blackout.ts
 */
import prisma from "../lib/prisma";

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "cloud-vapor" } });
  if (!mfr) throw new Error("Cloud Vapor introuvable");

  let callOfVape = await prisma.productRange.findFirst({
    where: { manufacturerId: mfr.id, slug: "call-of-vape" },
  });
  if (!callOfVape) {
    throw new Error("Gamme call-of-vape introuvable — créer d'abord la gamme Call of Vape");
  }

  // Fausses gammes indépendantes
  const fakeRanges = await prisma.productRange.findMany({
    where: {
      manufacturerId: mfr.id,
      OR: [
        { slug: { contains: "blackout" } },
        { name: { contains: "Blackout", mode: "insensitive" } },
        { slug: "call-of-vape-blackout" },
        { slug: { startsWith: "call-of-vape-blackout" } },
      ],
      NOT: { id: callOfVape.id },
    },
    include: { products: { select: { id: true, name: true } } },
  });

  const collection = await prisma.productCollection.upsert({
    where: {
      rangeId_slug: { rangeId: callOfVape.id, slug: "blackout" },
    },
    create: {
      rangeId: callOfVape.id,
      name: "Blackout",
      slug: "blackout",
      masterId: "COL-cloud_vapor-call_of_vape-blackout",
      hasOwnRoute: false,
      isActive: true,
    },
    update: {
      name: "Blackout",
      hasOwnRoute: false,
      isActive: true,
    },
  });

  let migrated = 0;

  // Produits déjà sous Call of Vape portant « Blackout »
  const blackoutProducts = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      OR: [
        { name: { contains: "blackout", mode: "insensitive" } },
        { slug: { contains: "blackout" } },
        { rangeId: { in: fakeRanges.map((r) => r.id) } },
      ],
    },
  });

  for (const p of blackoutProducts) {
    await prisma.product.update({
      where: { id: p.id },
      data: {
        rangeId: callOfVape.id,
        manufacturerId: mfr.id,
        collectionId: collection.id,
        range: "Call of Vape",
      },
    });
    migrated++;
  }

  // Désactiver fausses gammes après migration
  for (const fake of fakeRanges) {
    await prisma.productRange.update({
      where: { id: fake.id },
      data: {
        isActive: false,
        catalogVisible: false,
        verificationStatus: "INACTIVE",
        verificationEvidence: JSON.stringify({
          reason: "COLLECTION_NOT_RANGE",
          migratedToRange: "call-of-vape",
          migratedToCollection: "blackout",
          at: new Date().toISOString(),
        }),
      },
    });
  }

  // Propositions Yoann « Call of Vape Blackout » → marquer comme collection
  const proposals = await prisma.catalogRangeProposal.findMany({
    where: {
      manufacturerId: mfr.id,
      proposedName: { contains: "Blackout", mode: "insensitive" },
    },
  });
  for (const prop of proposals) {
    await prisma.catalogRangeProposal.update({
      where: { id: prop.id },
      data: {
        verificationStatus: "NAME_CORRECTION",
        notes:
          "Blackout est une collection / sous-série de Call of Vape — pas une gamme indépendante.",
        integratedRangeId: callOfVape.id,
      },
    });
  }

  console.log({
    manufacturer: mfr.slug,
    range: callOfVape.slug,
    collection: collection.slug,
    migratedProducts: migrated,
    fakeRangesDeactivated: fakeRanges.map((r) => r.slug),
    proposalsCorrected: proposals.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
