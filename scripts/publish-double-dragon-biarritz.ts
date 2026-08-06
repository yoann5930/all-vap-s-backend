/**
 * Intègre Biarritz Lab → DOUBLE DRAGON (collection officielle 10×50 ml + 1×100 ml / 0 mg).
 *
 * Source officielle : https://biarritz-lab.com/collections/double-dragon
 * - RÈGLE OBLIGATOIRE : contrôle doublons AVANT intégration
 *   → pas de doublon = on intègre (update SumUp)
 *   → doublon = on n'intègre PAS (skip + quarantine)
 * - Pas de mélange avec Mamita / Le Fruit Défendu / autres marques BL
 * - Photos officielles + normalisation style e-tasty obligatoire
 * - Prix boutique = prix SumUp existant (règle commerciale magasin)
 *
 * Usage: npx tsx scripts/publish-double-dragon-biarritz.ts
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { normalizeProductName } from "../lib/catalog/normalize";
import { normalizeProductImageToEtastyStyle } from "../lib/catalog/normalize-product-image";
import {
  assertNoOnlineDuplicates,
  quarantineDuplicateProduct,
  registerOrRejectDuplicate,
} from "../lib/catalog/assert-no-duplicates";
import { resolveEn13, upsertEn13InDescription } from "../lib/catalog/en13";

type OfficialProduct = {
  officialName: string;
  title: string;
  handle: string;
  url: string;
  image: string;
  priceOfficialEuros: number;
  available: boolean;
  description: string;
  aromas: string;
  format: string;
  nicotineMg: number;
  nicotineLabel: string;
  pgVg: string;
  origin: string;
  bottle: string;
  composition: string;
};

const COLLECTION_BLURB =
  "Des saveurs reptiliennes et flamboyantes, confectionnées avec un soin tout particulier. La collection DOUBLE DRAGON met à l'honneur le Fruit du Dragon, un ingrédient exotique et délicieux, agrémenté d'une touche de fraîcheur !";

/** Matching SumUp (noms actuels DB) → handle officiel. Ordre important (vanilla ice avant vanille). */
const SUMUP_TO_HANDLE: Array<{ match: RegExp; handle: string }> = [
  { match: /\btriple\s*dragon\b/i, handle: "triple-dragon-double-dragon-100-ml-00-mg" },
  { match: /vanilla\s*ice|vanille/i, handle: "fruit-du-dragon-vanilla-ice-double-dragon-50-ml-00-mg" },
  { match: /cerise/i, handle: "fruit-du-dragon-cerise-double-dragon-50-ml-00-mg" },
  { match: /framboise/i, handle: "fruit-du-dragon-framboise-double-dragon-50-ml-00-mg" },
  { match: /fraise/i, handle: "fruit-du-dragon-fraise-double-dragon-50-ml-00-mg" },
  { match: /limonade/i, handle: "fruit-du-dragon-limonade-double-dragon-50-ml-00-mg" },
  { match: /mandarine/i, handle: "fruit-du-dragon-mandarine-double-dragon-50-ml-00-mg" },
  { match: /m[uû]re/i, handle: "fruit-du-dragon-mure-double-dragon-50-ml-00-mg" },
  { match: /passion/i, handle: "fruit-du-dragon-passion-double-dragon-50-ml-00-mg" },
  { match: /p[eê]che/i, handle: "fruit-du-dragon-peche-double-dragon-50-ml-00-mg" },
  { match: /violette/i, handle: "fruit-du-dragon-violette-double-dragon-50-ml-00-mg" },
];

const OFFICIAL_JSON = path.resolve("data/rebuild/double-dragon-official.json");
const EXPECTED_COUNT = 11;

async function ensureManufacturerBrandRange() {
  let manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "biarritz-lab" } });
  if (!manufacturer) {
    manufacturer = await prisma.manufacturer.create({
      data: {
        masterId: "MFR-biarritz_lab",
        name: "Biarritz Lab",
        slug: "biarritz-lab",
        website: "https://biarritz-lab.com/",
        country: "France",
        status: "verifie",
        isActive: true,
      },
    });
  } else {
    manufacturer = await prisma.manufacturer.update({
      where: { id: manufacturer.id },
      data: {
        status: "verifie",
        isActive: true,
        website: manufacturer.website || "https://biarritz-lab.com/",
      },
    });
  }

  let brand = await prisma.brand.findFirst({
    where: {
      OR: [
        { slug: "double-dragon" },
        { name: { equals: "Double Dragon", mode: "insensitive" } },
      ],
    },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Double Dragon",
        slug: "double-dragon",
        manufacturerId: manufacturer.id,
        masterId: "BRD-biarritz_lab-double_dragon",
        status: "verifie",
        isActive: true,
      },
    });
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: {
        name: "Double Dragon",
        manufacturerId: manufacturer.id,
        status: "verifie",
        isActive: true,
        masterId: brand.masterId || "BRD-biarritz_lab-double_dragon",
      },
    });
  }

  let range = await prisma.productRange.findFirst({
    where: {
      slug: "double-dragon",
      OR: [{ brandId: brand.id }, { manufacturerId: manufacturer.id }],
    },
  });
  if (!range) {
    range = await prisma.productRange.create({
      data: {
        name: "Double Dragon",
        slug: "double-dragon",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        masterId: "RNG-biarritz_lab-double_dragon",
        formatCodes: ["50ml", "100ml"],
        status: "verifie",
        isActive: true,
        sortOrder: 30,
      },
    });
  } else {
    range = await prisma.productRange.update({
      where: { id: range.id },
      data: {
        name: "Double Dragon",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        formatCodes: ["50ml", "100ml"],
        status: "verifie",
        isActive: true,
      },
    });
  }

  return { manufacturer, brand, range };
}

function resolveHandle(sumupName: string): string | null {
  // Ne matcher que les lignes clairement Double Dragon / Triple Dragon
  if (!/double\s*dragons?|triple\s*dragon/i.test(sumupName)) return null;
  for (const rule of SUMUP_TO_HANDLE) {
    if (rule.match.test(sumupName)) return rule.handle;
  }
  return null;
}

function mediaDirFor(format: string): string {
  return path.resolve(`public/media/products/biarritz-lab/double-dragon/${format}`);
}

async function downloadOfficialImage(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0 (+double-dragon)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${imageUrl}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!fs.existsSync(OFFICIAL_JSON)) {
    throw new Error(
      `Fichier officiel manquant: ${OFFICIAL_JSON}. Lancer d'abord scripts/_fetch-double-dragon-official.py`
    );
  }
  const official = JSON.parse(fs.readFileSync(OFFICIAL_JSON, "utf8")) as OfficialProduct[];
  // Compléter arômes manquants
  for (const o of official) {
    if (!o.aromas && /vanille|vanilla/i.test(o.handle + o.title)) {
      o.aromas = "Fruit du dragon - Vanille";
    }
  }
  const byHandle = new Map(official.map((o) => [o.handle, o]));

  if (official.length !== EXPECTED_COUNT) {
    console.warn(`ATTENTION: officiel=${official.length} (attendu ${EXPECTED_COUNT})`);
  }

  const { manufacturer, brand, range } = await ensureManufacturerBrandRange();

  // ── CONTRÔLE DOUBLONS OBLIGATOIRE (avant toute intégration) ──
  await assertNoOnlineDuplicates(prisma, {
    productFamily: "DOUBLE_DRAGON",
    rangeName: "Double Dragon",
  });

  const candidates = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "Double dragon", mode: "insensitive" } },
        { name: { contains: "Double dragons", mode: "insensitive" } },
        { name: { contains: "Triple dragon", mode: "insensitive" } },
        { sumupName: { contains: "Double dragon", mode: "insensitive" } },
        { sumupName: { contains: "Triple dragon", mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
  });

  // Préférer les noms propres "Double dragon 50ml - ..." au doublon "Double dragons ... vanille"
  candidates.sort((a, b) => {
    const score = (n: string) =>
      /^double dragon 50ml/i.test(n) || /^triple dragon/i.test(n) ? 0 : 1;
    return score(a.name) - score(b.name);
  });

  const published: Array<Record<string, unknown>> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const quarantined: Array<{ name: string; reason: string }> = [];
  const usedHandles = new Set<string>();
  const usedSumup = new Set<string>();
  const usedProductIds: string[] = [];

  for (const p of candidates) {
    const handle = resolveHandle(p.name);
    if (!handle) {
      skipped.push({ name: p.name, reason: "pas_de_match_officiel" });
      continue;
    }

    // DOUBLON handle officiel → on n'intègre PAS
    const handleGate = registerOrRejectDuplicate(usedHandles, handle, "handle");
    if (!handleGate.ok) {
      await quarantineDuplicateProduct(prisma, p.id, handleGate.reason);
      quarantined.push({ name: p.name, reason: handleGate.reason });
      skipped.push({ name: p.name, reason: handleGate.reason });
      continue;
    }

    // DOUBLON SumUp → on n'intègre PAS
    if (p.sumupProductId) {
      const sumupGate = registerOrRejectDuplicate(usedSumup, p.sumupProductId, "sumup");
      if (!sumupGate.ok) {
        usedHandles.delete(handle); // libérer handle non utilisé
        await quarantineDuplicateProduct(prisma, p.id, sumupGate.reason);
        quarantined.push({ name: p.name, reason: sumupGate.reason });
        skipped.push({ name: p.name, reason: sumupGate.reason });
        continue;
      }
    }

    const off = byHandle.get(handle);
    if (!off) {
      usedHandles.delete(handle);
      if (p.sumupProductId) usedSumup.delete(p.sumupProductId);
      skipped.push({ name: p.name, reason: `handle_officiel_absent_${handle}` });
      continue;
    }
    if (!p.sumupProductId) {
      usedHandles.delete(handle);
      skipped.push({ name: p.name, reason: "sans_sumup" });
      continue;
    }
    if (!off.image) {
      usedHandles.delete(handle);
      usedSumup.delete(p.sumupProductId);
      skipped.push({ name: p.name, reason: "sans_image_officielle" });
      continue;
    }

    const volumeMl = off.format === "100ml" ? 100 : 50;
    const productType = off.format === "100ml" ? "100ml" : "50ml";
    const flavorSlug = slugify(off.officialName);
    const dir = mediaDirFor(productType);
    fs.mkdirSync(dir, { recursive: true });
    const outFile = path.join(dir, `${flavorSlug}.webp`);
    const rawFile = path.resolve(
      "public/media/products/_raw/biarritz-lab/double-dragon",
      `${flavorSlug}.png`
    );
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });

    process.stdout.write(`${off.officialName} (${productType}) ... `);
    const buffer = await downloadOfficialImage(off.image);
    fs.writeFileSync(rawFile, buffer);
    await normalizeProductImageToEtastyStyle({
      inputBuffer: buffer,
      outPath: outFile,
      flavorHint: `${off.officialName} ${off.aromas || ""} double-dragon biarritz fruit du dragon`,
      keepNativeFruits: false,
    });
    const publicUrl = `/media/products/biarritz-lab/double-dragon/${productType}/${flavorSlug}.webp`;

    const displayName = `${off.officialName} — Double Dragon — ${volumeMl} ml`;
    const productSlug = `double-dragon-${productType}-${flavorSlug}`;
    const priceCents = p.priceCents > 0 ? p.priceCents : Math.round(off.priceOfficialEuros * 100);

    const descParts = [
      off.description || COLLECTION_BLURB,
      off.aromas ? `Saveurs : ${off.aromas}.` : "",
      `Format ${off.format} · ${off.nicotineLabel} · PG/VG ${off.pgVg} · ${off.origin}.`,
      `Composition : ${off.composition}. Flacon ${off.bottle}.`,
    ].filter(Boolean);

    // EN13 : intégrer si présent (SumUp/DB/descriptif) — ne jamais inventer
    const en13 = resolveEn13({
      officialBarcode: null, // Shopify Biarritz Lab : barcode vide
      existingBarcode: p.barcode,
      description: p.description,
    });
    const description = upsertEn13InDescription(descParts.join("\n\n"), en13.barcode);

    let slug = productSlug;
    const slugClash = await prisma.product.findFirst({
      where: { slug, NOT: { id: p.id } },
    });
    if (slugClash) slug = `${productSlug}-${p.sumupProductId.slice(0, 8)}`;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: displayName,
        slug,
        normalizedName: normalizeProductName(displayName),
        description,
        barcode: en13.barcode,
        brand: "Biarritz Lab",
        range: "Double Dragon",
        productFamily: "DOUBLE_DRAGON",
        productType,
        volumeMl,
        category: "e-liquides",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        rangeId: range.id,
        imageUrl: publicUrl,
        imageStatus: "official",
        images: { set: [publicUrl] },
        priceCents,
        catalogStatus: "valide",
        visibleOnline: true,
        isActive: true,
        isPromo: false,
        isNew: false,
        isBestSeller: false,
        promotion10mlEligible: false,
        importAnomaly: null,
        source: p.source || "sumup",
      },
    });

    const existingImg = await prisma.productImage.findFirst({
      where: { productId: p.id, sortOrder: 0 },
    });
    if (existingImg) {
      await prisma.productImage.update({
        where: { id: existingImg.id },
        data: { url: publicUrl, status: "official", alt: displayName },
      });
    } else {
      await prisma.productImage.create({
        data: {
          productId: p.id,
          url: publicUrl,
          status: "official",
          sortOrder: 0,
          alt: displayName,
        },
      });
    }

    const variant = await prisma.productVariant.findFirst({
      where: { productId: p.id, nicotineMg: 0 },
    });
    if (!variant) {
      await prisma.productVariant.create({
        data: {
          productId: p.id,
          name: "0 mg",
          nicotineMg: 0,
          nicotineLabel: "0 mg",
          capacityMl: volumeMl,
          pgVgLabel: off.pgVg,
          priceCents,
          stock: p.stock,
          active: true,
          barcode: en13.barcode,
          sumupProductId: p.sumupProductId,
          sumupVariantId: p.sumupVariantId,
        },
      });
    } else {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          active: true,
          capacityMl: volumeMl,
          pgVgLabel: off.pgVg,
          nicotineLabel: "0 mg",
          ...(en13.barcode ? { barcode: en13.barcode } : {}),
        },
      });
    }

    usedProductIds.push(p.id);
    published.push({
      id: p.id,
      officialName: off.officialName,
      aromas: off.aromas,
      format: productType,
      slug,
      sumupProductId: p.sumupProductId,
      priceCentsSumup: priceCents,
      priceOfficialEuros: off.priceOfficialEuros,
      imageUrl: publicUrl,
      officialUrl: off.url,
      availableOfficial: off.available,
    });
    console.log("ok");
  }

  // Dépublication des extras Double Dragon hors liste officielle
  const extras = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      OR: [
        { productFamily: "DOUBLE_DRAGON" },
        { range: { equals: "Double Dragon", mode: "insensitive" } },
        { name: { contains: "Double Dragon", mode: "insensitive" } },
        { name: { contains: "Triple Dragon", mode: "insensitive" } },
      ],
      NOT: { id: { in: usedProductIds } },
    },
    select: { id: true, name: true },
  });
  const unpublishedExtras: string[] = [];
  for (const extra of extras) {
    await quarantineDuplicateProduct(prisma, extra.id, "extra_hors_liste_officielle");
    unpublishedExtras.push(extra.name);
  }

  // Contrôle final anti-doublons en ligne
  await assertNoOnlineDuplicates(prisma, {
    productFamily: "DOUBLE_DRAGON",
    rangeName: "Double Dragon",
  });

  const wrongRange = await prisma.product.findMany({
    where: {
      id: { in: usedProductIds },
      OR: [
        { range: { equals: "Mamita", mode: "insensitive" } },
        { range: { equals: "Le Fruit Défendu", mode: "insensitive" } },
        { productFamily: "MAMITA" },
        { productFamily: "LE_FRUIT_DEFENDU" },
      ],
    },
    select: { name: true },
  });

  const missingOfficial = official
    .filter((o) => !usedHandles.has(o.handle))
    .map((o) => o.officialName);

  const report = {
    date: new Date().toISOString(),
    fabricant: "Biarritz Lab",
    gamme: "Double Dragon",
    source: "https://biarritz-lab.com/collections/double-dragon",
    formats: ["50ml", "100ml"],
    nicotine: "0 mg uniquement (confirmé site officiel)",
    officialCount: official.length,
    publishedCount: published.length,
    published,
    skipped,
    quarantined,
    unpublishedExtras,
    missingOfficial,
    wrongRangeMix: wrongRange.map((w) => w.name),
    pricePolicy:
      "Prix boutique = prix SumUp existant. Prix fabricant officiel 18,90 € (50 ml) / 21,90 € (100 ml Triple Dragon) notés pour référence.",
    duplicatePolicy:
      "OBLIGATOIRE: contrôle doublons avant intégration. Pas de doublon → intégration. Doublon → skip + quarantine (jamais publié).",
    controlUrls: [
      "http://localhost:3000/fabricants/biarritz-lab",
      "http://localhost:3000/gammes/double-dragon?fabricant=biarritz-lab",
      "http://localhost:3000/e-liquides",
    ],
    noSumupWrite: true,
    separatedFromOtherBlRanges: true,
  };

  fs.mkdirSync(path.resolve("data/rebuild"), { recursive: true });
  fs.writeFileSync(
    path.resolve("data/rebuild/RAPPORT_BIARRITZ_DOUBLE_DRAGON.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const md = `# Rapport — Biarritz Lab · Double Dragon

Date : ${report.date}

## Source
${report.source}

## Résultat
- Officiels site : **${official.length}**
- Publiés All Vap's : **${published.length}**
- Ignorés : ${skipped.length}
- Manquants vs officiel : ${missingOfficial.length}
- Mélange autres gammes BL : ${wrongRange.length}

## Produits publiés
${published
  .map(
    (p) =>
      `- **${p.officialName}** (${p.aromas}) — ${p.format} — \`${p.slug}\` — SumUp ${p.sumupProductId} — ${p.priceCentsSumup} c (officiel ${p.priceOfficialEuros} €) — [fiche](${p.officialUrl})`
  )
  .join("\n")}

## Ignorés / doublons refusés
${skipped.map((s) => `- ${s.name} — ${s.reason}`).join("\n") || "_aucun_"}

## Quarantaine doublons
${quarantined.map((s) => `- ${s.name} — ${s.reason}`).join("\n") || "_aucun_"}

## Manquants officiel
${missingOfficial.map((n) => `- ${n}`).join("\n") || "_aucun_"}

## Contrôle
${report.controlUrls.map((u) => `- ${u}`).join("\n")}

## Règles respectées
- **Anti-doublons OBLIGATOIRE** : recherche avant intégration ; doublon = pas d'intégration
- Pas d'écriture SumUp
- Pas de mélange Mamita / Le Fruit Défendu / autres marques BL
- Photos officielles Biarritz Lab + style e-tasty
- Nicotine : 0 mg uniquement (site officiel)
- Formats : 50 ml (10 saveurs) + 100 ml (Triple Dragon)
`;

  fs.writeFileSync(path.resolve("data/rebuild/RAPPORT_BIARRITZ_DOUBLE_DRAGON.md"), md, "utf8");

  console.log("\n=== RÉSUMÉ ===");
  console.log(`Publiés: ${published.length}/${EXPECTED_COUNT}`);
  console.log(`Ignorés: ${skipped.length}`);
  console.log(`Manquants officiel: ${missingOfficial.length}`);
  console.log(`Rapport: data/rebuild/RAPPORT_BIARRITZ_DOUBLE_DRAGON.md`);

  if (published.length !== EXPECTED_COUNT || missingOfficial.length) {
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
