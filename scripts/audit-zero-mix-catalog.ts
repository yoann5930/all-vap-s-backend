/**
 * Audit zéro-mélange — relations fabricant / gamme / produit + médias.
 * Usage: npx tsx scripts/audit-zero-mix-catalog.ts
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { manufacturerLogoUrlIfExists } from "../lib/catalog/manufacturer-logo.server";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";
import { isRangeCatalogEligible, readRangeOfficialGate } from "../lib/catalog/official-verification";

const OUT = path.resolve("data/rebuild/AUDIT_ZERO_MIX.json");
const MD = path.resolve("docs/RAPPORT_AUDIT_ZERO_MELANGE.md");

async function main() {
  const manufacturers = await prisma.manufacturer.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      status: true,
      verificationStatus: true,
    },
  });

  const ranges = await prisma.productRange.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      manufacturerId: true,
      verificationStatus: true,
      catalogVisible: true,
      status: true,
      manufacturer: { select: { id: true, slug: true, name: true } },
    },
  });

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      manufacturerId: true,
      brandId: true,
      rangeId: true,
      range: true,
      imageUrl: true,
      imageStatus: true,
      visibleOnline: true,
      isActive: true,
      category: true,
      productType: true,
      volumeMl: true,
      sumupName: true,
      sumupProductId: true,
      sumupMapping: true,
      priceCents: true,
      catalogStatus: true,
      manufacturer: { select: { id: true, slug: true, name: true } },
      brand: { select: { id: true, manufacturerId: true, name: true } },
      rangeRef: {
        select: {
          id: true,
          slug: true,
          name: true,
          manufacturerId: true,
          manufacturer: { select: { slug: true } },
        },
      },
    },
  });

  const errors: Array<Record<string, unknown>> = [];
  const push = (
    code: string,
    entity: string,
    id: string,
    detail: Record<string, unknown>,
  ) => {
    errors.push({ code, entity, id, ...detail });
  };

  // --- Manufacturers logos ---
  let logosOk = 0;
  let logosMissing = 0;
  for (const m of manufacturers.filter((x) => x.isActive)) {
    const logo = manufacturerLogoUrlIfExists(m.slug);
    if (logo) logosOk += 1;
    else {
      logosMissing += 1;
      push("LOGO_MISSING", "manufacturer", m.id, { slug: m.slug, name: m.name });
    }
  }

  // --- Ranges: single manufacturer + cover ---
  let coversOk = 0;
  let coversMissing = 0;
  let rangesEligible = 0;
  for (const r of ranges) {
    if (!r.manufacturerId) {
      push("RANGE_NO_MANUFACTURER", "range", r.id, { slug: r.slug, name: r.name });
    }
    const eligible = isRangeCatalogEligible(readRangeOfficialGate(r as never));
    if (eligible) {
      rangesEligible += 1;
      const cover = rangeCoverUrl(r.manufacturer.slug, r.slug);
      if (cover) coversOk += 1;
      else {
        coversMissing += 1;
        push("COVER_MISSING_PUBLISHED", "range", r.id, {
          slug: r.slug,
          manufacturer: r.manufacturer.slug,
        });
      }
    }
  }

  // Duplicate range slugs across manufacturers
  const rangeSlugMap = new Map<string, typeof ranges>();
  for (const r of ranges) {
    const k = r.slug.toLowerCase();
    if (!rangeSlugMap.has(k)) rangeSlugMap.set(k, []);
    rangeSlugMap.get(k)!.push(r);
  }
  for (const [slug, list] of rangeSlugMap) {
    const mfrs = new Set(list.map((x) => x.manufacturerId));
    if (mfrs.size > 1) {
      push("RANGE_SLUG_SHARED_ACROSS_MFR", "range", slug, {
        manufacturers: list.map((x) => x.manufacturer.slug),
        rangeIds: list.map((x) => x.id),
      });
    }
  }

  // --- Products integrity ---
  let mixRange = 0;
  let mixBrand = 0;
  let noRange = 0;
  let noMfr = 0;
  let stringRangeOnly = 0;
  let visibleGateFail = 0;
  let visibleOk = 0;

  const active = products.filter((p) => p.isActive);
  for (const p of active) {
    if (!p.manufacturerId) {
      noMfr += 1;
      push("PRODUCT_NO_MANUFACTURER", "product", p.id, { slug: p.slug, name: p.name });
    }
    if (!p.rangeId) {
      noRange += 1;
      if (p.range) stringRangeOnly += 1;
      if (p.visibleOnline) {
        push("VISIBLE_WITHOUT_RANGE_ID", "product", p.id, {
          slug: p.slug,
          stringRange: p.range,
          manufacturer: p.manufacturer?.slug,
        });
      }
    }
    if (p.rangeRef && p.manufacturerId && p.rangeRef.manufacturerId !== p.manufacturerId) {
      mixRange += 1;
      push("MIX_PRODUCT_RANGE_WRONG_MFR", "product", p.id, {
        slug: p.slug,
        productMfr: p.manufacturer?.slug,
        range: p.rangeRef.slug,
        rangeMfr: p.rangeRef.manufacturer?.slug,
      });
    }
    if (
      p.brand &&
      p.manufacturerId &&
      p.brand.manufacturerId &&
      p.brand.manufacturerId !== p.manufacturerId
    ) {
      mixBrand += 1;
      push("MIX_PRODUCT_BRAND_WRONG_MFR", "product", p.id, {
        slug: p.slug,
        productMfr: p.manufacturer?.slug,
        brand: p.brand.name,
      });
    }

    if (
      p.visibleOnline &&
      isEliquideProduct({
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
      })
    ) {
      const gate = evaluateEliquidePublishGate({
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
        name: p.name,
        sumupName: p.sumupName,
        sumupProductId: p.sumupProductId,
        imageStatus: p.imageStatus,
        imageUrl: p.imageUrl,
        priceCents: p.priceCents,
        sumupMapping: p.sumupMapping,
        nameProvenance: parseNameProvenance(p.sumupMapping),
      });
      if (!gate.canPublishOnline) {
        visibleGateFail += 1;
        push("VISIBLE_FAILS_PUBLISH_GATE", "product", p.id, {
          slug: p.slug,
          reasons: gate.reasons,
          anomalies: gate.anomalies,
        });
      } else {
        visibleOk += 1;
      }
    }
  }

  // Same imageUrl reused across different manufacturers
  const byImage = new Map<string, typeof products>();
  for (const p of active.filter((x) => x.imageUrl && x.imageUrl.startsWith("/media/"))) {
    const k = p.imageUrl!;
    if (!byImage.has(k)) byImage.set(k, []);
    byImage.get(k)!.push(p);
  }
  let sharedImages = 0;
  for (const [url, list] of byImage) {
    const mfrs = new Set(list.map((x) => x.manufacturerId).filter(Boolean));
    if (mfrs.size > 1) {
      sharedImages += 1;
      push("IMAGE_SHARED_ACROSS_MANUFACTURERS", "image", url, {
        manufacturers: [
          ...new Set(list.map((x) => x.manufacturer?.slug).filter(Boolean)),
        ],
        productSlugs: list.slice(0, 8).map((x) => x.slug),
        count: list.length,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      manufacturers: manufacturers.length,
      manufacturersActive: manufacturers.filter((m) => m.isActive).length,
      ranges: ranges.length,
      rangesEligible,
      products: products.length,
      productsActive: active.length,
      productsVisible: active.filter((p) => p.visibleOnline).length,
    },
    media: { logosOk, logosMissing, coversOk, coversMissing },
    integrity: {
      mixProductRangeWrongManufacturer: mixRange,
      mixProductBrandWrongManufacturer: mixBrand,
      productsWithoutRangeId: noRange,
      productsWithoutManufacturer: noMfr,
      productsWithStringRangeOnly: stringRangeOnly,
      visibleFailPublishGate: visibleGateFail,
      visiblePassPublishGate: visibleOk,
      imagesSharedAcrossManufacturers: sharedImages,
    },
    errorCount: errors.length,
    errorsByCode: errors.reduce<Record<string, number>>((acc, e) => {
      const c = String(e.code);
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {}),
    errors: errors.slice(0, 500),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  const md = `# RAPPORT — Audit zéro mélange

**Date :** ${report.generatedAt}

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Fabricants | ${report.counts.manufacturersActive} actifs / ${report.counts.manufacturers} |
| Gammes | ${report.counts.ranges} (éligibles catalogue : ${report.counts.rangesEligible}) |
| Produits actifs | ${report.counts.productsActive} |
| Produits visibles | ${report.counts.productsVisible} |
| Logos OK / manquants | ${logosOk} / ${logosMissing} |
| Covers OK / manquants (éligibles) | ${coversOk} / ${coversMissing} |
| MIX produit↔gamme mauvais fabricant | ${mixRange} |
| MIX produit↔marque mauvais fabricant | ${mixBrand} |
| Visibles hors gate SumUp/photo | ${visibleGateFail} |
| Images partagées multi-fabricants | ${sharedImages} |
| **Erreurs totales** | **${errors.length}** |

## Erreurs par code

${Object.entries(report.errorsByCode)
  .map(([k, v]) => `- \`${k}\` : ${v}`)
  .join("\n")}

## Règle

Zéro affichage si une vérification échoue. Corrections auto → script \`fix-zero-mix-catalog.ts\`.

→ JSON : \`data/rebuild/AUDIT_ZERO_MIX.json\`
`;
  fs.writeFileSync(MD, md);
  console.log(JSON.stringify({ ...report, errors: undefined, sampleErrors: errors.slice(0, 15) }, null, 2));
  console.log(`→ ${OUT}`);
  console.log(`→ ${MD}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
