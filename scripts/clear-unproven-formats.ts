#!/usr/bin/env tsx
/**
 * Pour les produits validés dont le format MASTER est a_verifier :
 * ne pas conserver un productType inventé / non prouvé.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const produits = JSON.parse(
    fs.readFileSync(path.resolve("data/referentiel/06_PRODUITS.json"), "utf8")
  ).items as Array<{
    catalogStatus: string;
    formatStatus: string;
    format: string | null;
    db: { productId: string } | null;
    nom: string;
    anomalies: string[];
  }>;

  let cleared = 0;
  for (const p of produits) {
    if (p.catalogStatus !== "valide" || !p.db?.productId) continue;
    if (p.formatStatus === "valide" && p.format) continue;

    await prisma.product.update({
      where: { id: p.db.productId },
      data: {
        productType: null,
        importAnomaly: "format_a_verifier",
      },
    });
    console.log(`format→null : ${p.nom}`);
    cleared++;
  }

  const sansFormat = await prisma.product.count({
    where: { catalogStatus: "valide", OR: [{ productType: null }, { productType: "" }] },
  });
  console.log(JSON.stringify({ cleared, validesSansFormat: sansFormat }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
