/**
 * Intègre Biarritz Lab → LE FRUIT DÉFENDU (collection officielle 9×50 ml / 0 mg).
 *
 * Source officielle : https://biarritz-lab.com/collections/le-fruit-defendu
 * - RÈGLE OBLIGATOIRE : contrôle doublons AVANT intégration
 *   → pas de doublon = on intègre (update SumUp)
 *   → doublon = on n'intègre PAS (skip + quarantine)
 * - Pas de mélange avec Mamita / Double Dragon / autres marques BL
 * - Photos officielles + normalisation style e-tasty obligatoire
 * - Prix boutique = prix SumUp existant (règle commerciale magasin)
 *
 * Usage: npx tsx scripts/publish-fruit-defendu-biarritz.ts
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

/** Matching SumUp (noms actuels DB) → handle officiel. */
const SUMUP_TO_HANDLE: Array<{ match: RegExp; handle: string }> = [
  { match: /limonade.*pomme.*mure|pomme.*mure.*limonade/i, handle: "erotic-dream-le-fruit-defendu-50-ml-00-mg" },
  { match: /past[eè]que.*fraise/i, handle: "ghost-riders-le-fruit-defendu-50-ml-00-mg" },
  { match: /fraise\s*frais/i, handle: "fraise-damour-le-fruit-defendu-50-ml-00-mg" },
  { match: /cassis.*cerise.*violette/i, handle: "loving-memory-le-fruit-defendu-50-ml-00-mg" },
  { match: /mangue/i, handle: "mango-fresh-killah-le-fruit-defendu-50-ml-00-mg" },
  { match: /myrtille/i, handle: "myrtillissime-le-fruit-defendu-50-ml-00-mg" },
  { match: /p[eê]che.*grenadine|grenadine.*p[eê]che/i, handle: "peach-sex-sun-le-fruit-defendu-50-ml-00-mg" },
  { match: /dragon.*ananas|ananas.*dragon/i, handle: "satanananas-le-fruit-defendu-50-ml-00-mg" },
  { match: /melon.*abricot|abricot.*melon/i, handle: "les-demons-de-jesus-le-fruit-defendu-50-ml-00-mg" },
];

const MEDIA_DIR = path.resolve("public/media/products/biarritz-lab/le-fruit-defendu/50ml");
const OFFICIAL_JSON = path.resolve("data/rebuild/fruit-defendu-official.json");

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
        { slug: "le-fruit-defendu" },
        { name: { equals: "Le Fruit Défendu", mode: "insensitive" } },
      ],
    },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Le Fruit Défendu",
        slug: "le-fruit-defendu",
        manufacturerId: manufacturer.id,
        masterId: "BRD-biarritz_lab-le_fruit_defendu",
        status: "verifie",
        isActive: true,
      },
    });
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: {
        name: "Le Fruit Défendu",
        manufacturerId: manufacturer.id,
        status: "verifie",
        isActive: true,
        masterId: brand.masterId || "BRD-biarritz_lab-le_fruit_defendu",
      },
    });
  }

  let range = await prisma.productRange.findFirst({
    where: {
      slug: "le-fruit-defendu",
      OR: [{ brandId: brand.id }, { manufacturerId: manufacturer.id }],
    },
  });
  if (!range) {
    range = await prisma.productRange.create({
      data: {
        name: "Le Fruit Défendu",
        slug: "le-fruit-defendu",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        masterId: "RNG-biarritz_lab-le_fruit_defendu",
        formatCodes: ["50ml"],
        status: "verifie",
        isActive: true,
        sortOrder: 20,
      },
    });
  } else {
    range = await prisma.productRange.update({
      where: { id: range.id },
      data: {
        name: "Le Fruit Défendu",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        formatCodes: ["50ml"],
        status: "verifie",
        isActive: true,
      },
    });
  }

  return { manufacturer, brand, range };
}

function resolveHandle(sumupName: string): string | null {
  for (const rule of SUMUP_TO_HANDLE) {
    if (rule.match.test(sumupName)) return rule.handle;
  }
  return null;
}

async function downloadOfficialImage(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0 (+fruit-defendu)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${imageUrl}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!fs.existsSync(OFFICIAL_JSON)) {
    throw new Error(
      `Fichier officiel manquant: ${OFFICIAL_JSON}. Lancer d'abord scripts/_fetch-fruit-defendu-official.py`
    );
  }
  const official = JSON.parse(fs.readFileSync(OFFICIAL_JSON, "utf8")) as OfficialProduct[];
  const byHandle = new Map(official.map((o) => [o.handle, o]));

  if (official.length !== 9) {
    console.warn(`ATTENTION: officiel=${official.length} (attendu 9)`);
  }

  const { manufacturer, brand, range } = await ensureManufacturerBrandRange();

  await assertNoOnlineDuplicates(prisma, {
    productFamily: "LE_FRUIT_DEFENDU",
    rangeName: "Le Fruit Défendu",
  });

  const candidates = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "Fruit defendu", mode: "insensitive" } },
        { name: { contains: "Fruit Défendu", mode: "insensitive" } },
        { name: { contains: "defendu", mode: "insensitive" } },
        { name: { contains: "défendu", mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
  });

  const published: Array<Record<string, unknown>> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const usedHandles = new Set<string>();
  const usedSumup = new Set<string>();
  const usedProductIds: string[] = [];

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(path.join(MEDIA_DIR, "..", "..", "_raw", "le-fruit-defendu"), { recursive: true });

  for (const p of candidates) {
    const handle = resolveHandle(p.name);
    if (!handle) {
      skipped.push({ name: p.name, reason: "pas_de_match_officiel" });
      continue;
    }
    const handleGate = registerOrRejectDuplicate(usedHandles, handle, "handle");
    if (!handleGate.ok) {
      await quarantineDuplicateProduct(prisma, p.id, handleGate.reason);
      skipped.push({ name: p.name, reason: handleGate.reason });
      continue;
    }
    if (p.sumupProductId) {
      const sumupGate = registerOrRejectDuplicate(usedSumup, p.sumupProductId, "sumup");
      if (!sumupGate.ok) {
        usedHandles.delete(handle);
        await quarantineDuplicateProduct(prisma, p.id, sumupGate.reason);
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

    const flavorSlug = slugify(off.officialName);
    const outFile = path.join(MEDIA_DIR, `${flavorSlug}.webp`);
    const rawFile = path.resolve(
      "public/media/products/_raw/biarritz-lab/le-fruit-defendu",
      `${flavorSlug}.png`
    );
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });

    process.stdout.write(`${off.officialName} ... `);
    const buffer = await downloadOfficialImage(off.image);
    fs.writeFileSync(rawFile, buffer);
    await normalizeProductImageToEtastyStyle({
      inputBuffer: buffer,
      outPath: outFile,
      flavorHint: `${off.officialName} ${off.aromas || ""} le-fruit-defendu biarritz`,
      keepNativeFruits: false,
    });
    const publicUrl = `/media/products/biarritz-lab/le-fruit-defendu/50ml/${flavorSlug}.webp`;

    const displayName = `${off.officialName} — Le Fruit Défendu — 50 ml`;
    const productSlug = `le-fruit-defendu-50ml-${flavorSlug}`;
    // garder prix SumUp (magasin) — noter écart vs officiel 18,90 €
    const priceCents = p.priceCents > 0 ? p.priceCents : Math.round(off.priceOfficialEuros * 100);

    const descParts = [
      off.description,
      off.aromas ? `Saveurs : ${off.aromas}.` : "",
      `Format ${off.format} · ${off.nicotineLabel} · PG/VG ${off.pgVg} · ${off.origin}.`,
      `Composition : ${off.composition}. Flacon ${off.bottle}.`,
    ].filter(Boolean);

    // EN13 : intégrer si présent — ne jamais inventer
    const en13 = resolveEn13({
      officialBarcode: null,
      existingBarcode: p.barcode,
      description: p.description,
    });
    const description = upsertEn13InDescription(descParts.join("\n\n"), en13.barcode);

    // Résoudre slug unique
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
        range: "Le Fruit Défendu",
        productFamily: "LE_FRUIT_DEFENDU",
        productType: "50ml",
        volumeMl: 50,
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

    // Variante 0 mg si absente
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
          capacityMl: 50,
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
          capacityMl: 50,
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

  // Sécurité : ne pas laisser d'autres "fruit defendu" en ligne hors liste
  const extras = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      OR: [
        { productFamily: "LE_FRUIT_DEFENDU" },
        { range: { equals: "Le Fruit Défendu", mode: "insensitive" } },
        { name: { contains: "Fruit defendu", mode: "insensitive" } },
        { name: { contains: "Fruit Défendu", mode: "insensitive" } },
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

  await assertNoOnlineDuplicates(prisma, {
    productFamily: "LE_FRUIT_DEFENDU",
    rangeName: "Le Fruit Défendu",
  });

  // Vérifier qu'aucun produit Fruit Défendu n'est rattaché à Mamita
  const wrongRange = await prisma.product.findMany({
    where: {
      id: { in: usedProductIds },
      OR: [{ range: { equals: "Mamita", mode: "insensitive" } }, { productFamily: "MAMITA" }],
    },
    select: { name: true },
  });

  const missingOfficial = official
    .filter((o) => !usedHandles.has(o.handle))
    .map((o) => o.officialName);

  const report = {
    date: new Date().toISOString(),
    fabricant: "Biarritz Lab",
    gamme: "Le Fruit Défendu",
    source: "https://biarritz-lab.com/collections/le-fruit-defendu",
    format: "50ml",
    nicotine: "0 mg uniquement (confirmé site officiel)",
    officialCount: official.length,
    publishedCount: published.length,
    published,
    skipped,
    unpublishedExtras,
    missingOfficial,
    wrongRangeMix: wrongRange.map((w) => w.name),
    pricePolicy:
      "Prix boutique = prix SumUp existant. Prix fabricant officiel 18,90 € noté pour référence (écart éventuel).",
    controlUrls: [
      "http://localhost:3000/fabricants/biarritz-lab",
      "http://localhost:3000/gammes/le-fruit-defendu?fabricant=biarritz-lab",
      "http://localhost:3000/e-liquides",
    ],
    noSumupWrite: true,
    separatedFromMamita: true,
  };

  fs.mkdirSync(path.resolve("data/rebuild"), { recursive: true });
  fs.writeFileSync(
    path.resolve("data/rebuild/RAPPORT_BIARRITZ_FRUIT_DEFENDU.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const md = `# Rapport — Biarritz Lab · Le Fruit Défendu 50 ml

Date : ${report.date}

## Source
${report.source}

## Résultat
- Officiels site : **${official.length}**
- Publiés All Vap's : **${published.length}**
- Ignorés : ${skipped.length}
- Manquants vs officiel : ${missingOfficial.length}
- Mélange Mamita détecté : ${wrongRange.length}

## Produits publiés
${published
  .map(
    (p) =>
      `- **${p.officialName}** (${p.aromas}) — \`${p.slug}\` — SumUp ${p.sumupProductId} — ${p.priceCentsSumup} c (officiel ${p.priceOfficialEuros} €) — [fiche](${p.officialUrl})`
  )
  .join("\n")}

## Ignorés
${skipped.map((s) => `- ${s.name} — ${s.reason}`).join("\n") || "_aucun_"}

## Manquants officiel
${missingOfficial.map((n) => `- ${n}`).join("\n") || "_aucun_"}

## Contrôle
${report.controlUrls.map((u) => `- ${u}`).join("\n")}

## Règles respectées
- **Anti-doublons OBLIGATOIRE** : recherche avant intégration ; doublon = pas d'intégration
- Pas d'écriture SumUp
- Pas de mélange Mamita / Double Dragon / autres marques BL
- Photos officielles Biarritz Lab + style e-tasty
- Nicotine : 0 mg uniquement (site officiel)
`;

  fs.writeFileSync(path.resolve("data/rebuild/RAPPORT_BIARRITZ_FRUIT_DEFENDU.md"), md, "utf8");

  console.log("\n=== RÉSUMÉ ===");
  console.log(`Publiés: ${published.length}/9`);
  console.log(`Ignorés: ${skipped.length}`);
  console.log(`Manquants officiel: ${missingOfficial.length}`);
  console.log(`Rapport: data/rebuild/RAPPORT_BIARRITZ_FRUIT_DEFENDU.md`);

  if (published.length !== 9 || missingOfficial.length) {
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
