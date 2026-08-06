/**
 * Applique la politique EN13 sur les gammes Biarritz Lab déjà publiées.
 * - Conserve les barcodes SumUp valides déjà en DB (pas d'invention)
 * - Les ajoute au descriptif si absents
 * - Ne crée aucun code manquant
 *
 * Usage: npx tsx scripts/apply-biarritz-en13.ts
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import {
  isValidEan13,
  resolveEn13,
  upsertEn13InDescription,
} from "../lib/catalog/en13";

const FAMILIES = ["DOUBLE_DRAGON", "LE_FRUIT_DEFENDU", "MAMITA"] as const;

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { productFamily: { in: [...FAMILIES] } },
        { range: { in: ["Double Dragon", "Le Fruit Défendu", "Mamita"] } },
      ],
      visibleOnline: true,
    },
    include: { variants: true },
    orderBy: { name: "asc" },
  });

  const applied: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const invalid: Array<Record<string, unknown>> = [];

  for (const p of products) {
    const resolved = resolveEn13({
      officialBarcode: null, // site Biarritz Lab : barcode Shopify vide (vérifié)
      existingBarcode: p.barcode,
      description: p.description,
    });

    if (!resolved.barcode) {
      skipped.push({
        name: p.name,
        reason: "aucun_en13_valide_source",
        hadRawBarcode: p.barcode,
      });
      // Ne pas inventer : s'assurer qu'aucune ligne fantôme n'est dans le descriptif
      const cleaned = upsertEn13InDescription(p.description, null);
      if (cleaned !== p.description) {
        await prisma.product.update({
          where: { id: p.id },
          data: { description: cleaned, barcode: null },
        });
      }
      continue;
    }

    if (p.barcode && !isValidEan13(p.barcode)) {
      invalid.push({ name: p.name, barcode: p.barcode, action: "conserve_mais_signale" });
    }

    const newDesc = upsertEn13InDescription(p.description, resolved.barcode);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        barcode: resolved.barcode,
        description: newDesc,
      },
    });

    // Propager sur variante 0 mg si absente
    const v0 = p.variants.find((v) => v.nicotineMg === 0) || p.variants[0];
    if (v0 && (!v0.barcode || !isValidEan13(v0.barcode))) {
      await prisma.productVariant.update({
        where: { id: v0.id },
        data: { barcode: resolved.barcode },
      });
    }

    applied.push({
      name: p.name,
      barcode: resolved.barcode,
      source: resolved.source,
      descriptionUpdated: newDesc !== p.description,
    });
  }

  const report = {
    date: new Date().toISOString(),
    rule: "EN13 si présent → intégrer (+ descriptif). Absent → ne pas inventer.",
    officialBiarritzLabBarcodes: "aucun (Shopify barcode vide — vérifié 2026-07-30)",
    appliedCount: applied.length,
    skippedNoEn13: skipped.length,
    invalidChecksumNoted: invalid.length,
    applied,
    skipped,
    invalid,
  };

  fs.mkdirSync(path.resolve("data/rebuild"), { recursive: true });
  fs.writeFileSync(
    path.resolve("data/rebuild/RAPPORT_BIARRITZ_EN13.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const md = `# Rapport EN13 — Biarritz Lab (Mamita / Fruit Défendu / Double Dragon)

Date : ${report.date}

## Règle
- EN13 trouvé (valide) → **intégration obligatoire** (champ + descriptif)
- EN13 absent → **ne pas inventer**

## Source fabricant
Site Biarritz Lab (Shopify) : **aucun barcode** publié sur Double Dragon / Le Fruit Défendu / Mamita.

## Résultat
- Intégrés / confirmés : **${applied.length}**
- Sans EN13 (non inventés) : ${skipped.length}
- Checksum douteux noté : ${invalid.length}

## Produits
${applied.map((a) => `- **${a.name}** — \`${a.barcode}\` (source: ${a.source})`).join("\n")}
`;

  fs.writeFileSync(path.resolve("data/rebuild/RAPPORT_BIARRITZ_EN13.md"), md, "utf8");

  console.log(`EN13 appliqués: ${applied.length}`);
  console.log(`Sans EN13 (non inventés): ${skipped.length}`);
  console.log(`Rapport: data/rebuild/RAPPORT_BIARRITZ_EN13.md`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
