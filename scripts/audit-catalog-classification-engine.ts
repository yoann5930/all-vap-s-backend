/**
 * Audit lecture seule + apply safe CONFIRME only.
 * Usage:
 *   npx tsx scripts/audit-catalog-classification-engine.ts
 *   npx tsx scripts/audit-catalog-classification-engine.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { classifyProductById } from "../lib/catalog/classification-engine";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import { A_CLASSER_SLUG } from "../lib/catalog/eliquide-range-tokens";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      sumupName: true,
      barcode: true,
      manufacturerId: true,
      rangeId: true,
      classificationStatus: true,
      category: true,
    },
  });

  const manufacturers = await prisma.manufacturer.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      _count: { select: { products: true, ranges: true } },
    },
  });

  const ranges = await prisma.productRange.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      manufacturerId: true,
      manufacturer: { select: { slug: true } },
      _count: { select: { products: true } },
    },
  });

  let correctlyClassified = 0;
  let reclassified = 0;
  let toValidate = 0;
  let rangesWithoutProducts = 0;
  let rangesBadLogo = 0;
  let rangesFixedVisual = 0;
  const ambiguous: string[] = [];

  for (const p of products) {
    const res = await classifyProductById({
      productId: p.id,
      source: "audit_safe",
      barcodeHint: p.barcode,
      apply: APPLY,
    });
    if (res.confidence === "CONFIRME") {
      correctlyClassified += 1;
      if (res.applied) reclassified += 1;
    } else {
      toValidate += 1;
      if (ambiguous.length < 40) {
        ambiguous.push(`${p.name} [${res.confidence}] ${res.reason}`);
      }
    }
  }

  for (const r of ranges) {
    if (r.slug === A_CLASSER_SLUG) continue;
    if (r._count.products === 0) rangesWithoutProducts += 1;
    const mfrSlug = r.manufacturer?.slug;
    if (mfrSlug) {
      const cover = rangeCoverUrl(mfrSlug, r.slug);
      if (!cover) {
        rangesBadLogo += 1;
        const marker = path.join(
          ROOT,
          "public",
          "media",
          "manufacturers",
          mfrSlug,
          "ranges",
          `ASSET_MANQUANT_${r.slug}.json`
        );
        if (APPLY) {
          fs.mkdirSync(path.dirname(marker), { recursive: true });
          if (!fs.existsSync(marker)) {
            fs.writeFileSync(
              marker,
              JSON.stringify(
                {
                  slug: r.slug,
                  manufacturerSlug: mfrSlug,
                  status: "ASSET_MANQUANT",
                  at: new Date().toISOString(),
                },
                null,
                2
              ),
              "utf8"
            );
            rangesFixedVisual += 1;
          }
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    stocksTouched: false,
    produitsAudites: products.length,
    produitsCorrectementClasses: correctlyClassified,
    produitsReclassesAutomatiquement: reclassified,
    produitsAValider: toValidate,
    fabricantsVerifies: manufacturers.length,
    gammesVerifiees: ranges.filter((r) => r.slug !== A_CLASSER_SLUG).length,
    gammesSansProduits: rangesWithoutProducts,
    gammesAvecMauvaisLogo: rangesBadLogo,
    gammesCorrigees: rangesFixedVisual,
    fabricantsSansProduits: manufacturers.filter((m) => m._count.products === 0)
      .length,
    ambiguousSample: ambiguous,
  };

  const outJson = path.join(ROOT, "rapports", "audit-classification-engine-latest.json");
  const outMd = path.join(ROOT, "docs", "AUDIT_MOTEUR_CLASSIFICATION_CATALOGUE.md");
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    outMd,
    `# Audit moteur classification catalogue

Généré : ${report.generatedAt}
Apply : ${APPLY}

| Métrique | Valeur |
|----------|--------|
| Produits audités | ${report.produitsAudites} |
| Produits correctement classés | ${report.produitsCorrectementClasses} |
| Produits reclassés automatiquement | ${report.produitsReclassesAutomatiquement} |
| Produits à valider | ${report.produitsAValider} |
| Fabricants vérifiés | ${report.fabricantsVerifies} |
| Gammes vérifiées | ${report.gammesVerifiees} |
| Gammes sans produits | ${report.gammesSansProduits} |
| Gammes avec mauvais logo / ASSET MANQUANT | ${report.gammesAvecMauvaisLogo} |
| Marqueurs ASSET_MANQUANT écrits | ${report.gammesCorrigees} |

Stocks modifiés : **NON**

## Ambiguës (échantillon)

${ambiguous.map((a) => `- ${a}`).join("\n") || "_aucune_"}
`,
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
