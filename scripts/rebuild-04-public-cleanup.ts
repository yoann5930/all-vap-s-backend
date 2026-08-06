#!/usr/bin/env tsx
/**
 * ÉTAPE 4 — Nettoyage public immédiat.
 * Préfère un site vide à des données fausses.
 * Ne touche PAS SumUp (API). Ne publie rien.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const before = {
    visible: await prisma.product.count({ where: { visibleOnline: true } }),
    promo: await prisma.product.count({ where: { isPromo: true } }),
    isNew: await prisma.product.count({ where: { isNew: true } }),
    best: await prisma.product.count({ where: { isBestSeller: true } }),
    active: await prisma.product.count({ where: { isActive: true } }),
  };

  // 1) Tout retirer de l'affichage public
  const unpub = await prisma.product.updateMany({
    data: {
      visibleOnline: false,
      isPromo: false,
      promoPriceCents: null,
      isNew: false,
      isBestSeller: false,
    },
  });

  // 2) Iced → Ice UNIQUEMENT pour la gamme Ice Cool / Ice Cool X (pas les saveurs "iced" génériques)
  const icedCandidates = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "Iced", mode: "insensitive" } },
        { range: { contains: "Iced", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      range: true,
      normalizedName: true,
      productFamily: true,
      brand: true,
    },
  });

  const nameFixes: Array<{ id: string; from: string; to: string }> = [];
  for (const p of icedCandidates) {
    const ctx = `${p.name} ${p.range || ""} ${p.productFamily || ""} ${p.brand || ""}`;
    const isIceCoolRange =
      /ice\s*cool/i.test(ctx) ||
      /ICE_COOL/i.test(p.productFamily || "") ||
      (/liquidarom/i.test(ctx) && /\biced\b/i.test(p.range || ""));
    if (!isIceCoolRange) continue;

    const nextName = p.name.replace(/\bIced\b/gi, "Ice");
    const nextRange = p.range ? p.range.replace(/\bIced\b/gi, "Ice") : p.range;
    const nextNorm = p.normalizedName
      ? p.normalizedName.replace(/\biced\b/gi, "ice")
      : p.normalizedName;
    if (nextName !== p.name || nextRange !== p.range || nextNorm !== p.normalizedName) {
      await prisma.product.update({
        where: { id: p.id },
        data: { name: nextName, range: nextRange, normalizedName: nextNorm },
      });
      nameFixes.push({ id: p.id, from: p.name, to: nextName });
    }
  }

  // High School — uniquement si lié à Ice (ne pas toucher d'autres contextes)
  const highSchool = await prisma.product.findMany({
    where: {
      AND: [
        { name: { contains: "High School", mode: "insensitive" } },
        {
          OR: [
            { name: { contains: "Ice", mode: "insensitive" } },
            { range: { contains: "Ice", mode: "insensitive" } },
            { productFamily: { contains: "ICE", mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, name: true },
  });
  for (const p of highSchool) {
    await prisma.product.update({
      where: { id: p.id },
      data: {
        visibleOnline: false,
        importAnomaly: "nom_high_school_a_verifier",
        catalogStatus: "a_verifier",
      },
    });
  }

  const after = {
    visible: await prisma.product.count({ where: { visibleOnline: true } }),
    promo: await prisma.product.count({ where: { isPromo: true } }),
    isNew: await prisma.product.count({ where: { isNew: true } }),
    best: await prisma.product.count({ where: { isBestSeller: true } }),
    valides: await prisma.product.count({ where: { catalogStatus: "valide" } }),
  };

  const report = {
    date: new Date().toISOString(),
    etape: 4,
    before,
    updatedRows: unpub.count,
    after,
    icedNameFixes: nameFixes,
    highSchoolFlagged: highSchool.map((p) => p.name),
    rule: "Aucun produit public tant que PUBLISHED non reconstruit. Site vide préféré.",
  };

  const outDir = path.resolve("data/rebuild");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "04_PUBLIC_CLEANUP.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
