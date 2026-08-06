/**
 * Publie UNIQUEMENT Biarritz Lab → Mamita 50 ml (produits déjà en DB + photo officielle + SumUp).
 * - Pas de création de doublons (update des lignes existantes uniquement)
 * - Aucune écriture SumUp
 * - N'invente aucun produit hors liste validée
 * - Exclut les fiches hors_sumup / a_verifier / conflit Bowl de Céréales générique
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { resolveEn13, upsertEn13InDescription } from "../lib/catalog/en13";

/** Whitelist stricte des 5 références SumUp validées (référentiel INDEX). */
const ALLOWED_SUMUP_IDS = new Set([
  "6724a4dc-11ce-4ac1-aed6-7db00a8259bd", // Bowl de Céréales Noisette Pécan Crème
  // Les 4 autres IDs sont validés par slug ; on les complète au runtime depuis la DB
]);

const ALLOWED_BY_SLUG_PART = [
  "bowl-de-cereales-noisette-pecan-creme",
  "cafe-stout",
  "cafe-vanille-custard",
  "cookie-choco-noisette",
  "custard-vanille-pecan",
] as const;

async function ensureManufacturerAndRange() {
  let manufacturer = await prisma.manufacturer.findUnique({
    where: { slug: "biarritz-lab" },
  });
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
        masterId: manufacturer.masterId || "MFR-biarritz_lab",
      },
    });
  }

  let brand = await prisma.brand.findFirst({
    where: {
      OR: [
        { slug: "mamita" },
        { name: { equals: "Mamita", mode: "insensitive" } },
      ],
    },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Mamita",
        slug: "mamita",
        manufacturerId: manufacturer.id,
        isActive: true,
      },
    });
  } else if (brand.manufacturerId !== manufacturer.id) {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: { manufacturerId: manufacturer.id, isActive: true },
    });
  }

  let range = await prisma.productRange.findFirst({
    where: {
      slug: "mamita",
      OR: [{ brandId: brand.id }, { manufacturerId: manufacturer.id }],
    },
  });
  if (!range) {
    range = await prisma.productRange.create({
      data: {
        name: "Mamita",
        slug: "mamita",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        masterId: "RNG-biarritz_lab-mamita",
        formatCodes: ["50ml"],
        status: "verifie",
        isActive: true,
      },
    });
  } else {
    range = await prisma.productRange.update({
      where: { id: range.id },
      data: {
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        status: "verifie",
        isActive: true,
        formatCodes: ["50ml"],
      },
    });
  }

  return { manufacturer, brand, range };
}

function isAllowedProduct(p: {
  slug: string;
  name: string;
  sumupProductId: string | null;
}): boolean {
  const slug = p.slug.toLowerCase();
  if (ALLOWED_BY_SLUG_PART.some((part) => slug.includes(part))) return true;
  if (p.sumupProductId && ALLOWED_SUMUP_IDS.has(p.sumupProductId)) return true;
  return false;
}

async function main() {
  const { manufacturer, range } = await ensureManufacturerAndRange();

  const candidates = await prisma.product.findMany({
    where: {
      catalogStatus: "valide",
      OR: [
        { productFamily: "MAMITA" },
        { brand: { equals: "Biarritz Lab", mode: "insensitive" } },
        { range: { equals: "Mamita", mode: "insensitive" } },
        { name: { contains: "Mamita", mode: "insensitive" } },
        { slug: { contains: "mamita", mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
  });

  const published: Array<{ id: string; name: string; slug: string; sumupProductId: string | null }> =
    [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const seenSumup = new Set<string>();

  for (const p of candidates) {
    if (!isAllowedProduct(p)) {
      skipped.push({ name: p.name, reason: "hors_whitelist_mamita_5" });
      continue;
    }
    if (p.sumupProductId) {
      if (seenSumup.has(p.sumupProductId)) {
        skipped.push({ name: p.name, reason: "doublon_sumup" });
        continue;
      }
      seenSumup.add(p.sumupProductId);
    }
    if (p.imageStatus !== "official" || !p.imageUrl?.startsWith("/media/")) {
      skipped.push({ name: p.name, reason: "photo" });
      continue;
    }
    const abs = path.resolve("public", p.imageUrl.replace(/^\//, ""));
    if (!fs.existsSync(abs)) {
      skipped.push({ name: p.name, reason: "fichier_image_absent" });
      continue;
    }
    if (!p.productType || !/^\d+ml$/i.test(p.productType)) {
      skipped.push({ name: p.name, reason: "format" });
      continue;
    }
    if (!p.priceCents || p.priceCents <= 0) {
      skipped.push({ name: p.name, reason: "prix" });
      continue;
    }
    if (!p.sumupProductId) {
      skipped.push({ name: p.name, reason: "sumup" });
      continue;
    }

    const displayName = p.name.includes("Mamita")
      ? p.name
      : `${p.name} — Mamita — 50 ml`;

    const en13 = resolveEn13({
      officialBarcode: null,
      existingBarcode: p.barcode,
      description: p.description,
    });
    const description = upsertEn13InDescription(p.description, en13.barcode);

    await prisma.product.update({
      where: { id: p.id },
      data: {
        visibleOnline: true,
        isActive: true,
        isPromo: false,
        isNew: false,
        isBestSeller: false,
        brand: "Biarritz Lab",
        range: "Mamita",
        productFamily: "MAMITA",
        productType: "50ml",
        volumeMl: 50,
        promotion10mlEligible: false,
        name: displayName,
        description,
        barcode: en13.barcode,
        importAnomaly: null,
        manufacturerId: manufacturer.id,
        rangeId: range.id,
        imageStatus: "official",
      },
    });

    published.push({
      id: p.id,
      name: displayName,
      slug: p.slug,
      sumupProductId: p.sumupProductId,
    });
  }

  // Sécurité anti-doublon : s'assurer qu'aucun autre produit Mamita non whitelisté n'est en ligne
  const onlineExtra = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      OR: [
        { productFamily: "MAMITA" },
        { brand: { equals: "Biarritz Lab", mode: "insensitive" } },
        { range: { equals: "Mamita", mode: "insensitive" } },
      ],
      NOT: { id: { in: published.map((x) => x.id) } },
    },
    select: { id: true, name: true, slug: true },
  });

  const unpublishedExtras: string[] = [];
  for (const extra of onlineExtra) {
    if (!isAllowedProduct(extra as { slug: string; name: string; sumupProductId: string | null })) {
      await prisma.product.update({
        where: { id: extra.id },
        data: { visibleOnline: false },
      });
      unpublishedExtras.push(extra.name);
    }
  }

  const report = {
    date: new Date().toISOString(),
    fabricant: "Biarritz Lab",
    gamme: "Mamita",
    format: "50ml",
    publishedCount: published.length,
    published,
    skipped,
    unpublishedExtras,
    controlUrls: [
      "http://localhost:3000/fabricants/biarritz-lab",
      "http://localhost:3000/gammes/mamita?fabricant=biarritz-lab",
    ],
    noSumupWrite: true,
    noDuplicates: true,
  };

  fs.mkdirSync(path.resolve("data/rebuild"), { recursive: true });
  fs.writeFileSync(
    path.resolve("data/rebuild/RAPPORT_BIARRITZ_MAMITA.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const md = `# Rapport — Biarritz Lab · Mamita 50 ml

Date : ${report.date}

## Résultat
- Publiés : **${published.length}**
- Ignorés : ${skipped.length}
- Extras dépubliés (anti-doublon) : ${unpublishedExtras.length}

## Produits publiés
${published.map((p) => `- ${p.name} (\`${p.slug}\`) — SumUp ${p.sumupProductId}`).join("\n")}

## Ignorés
${skipped.map((s) => `- ${s.name} — ${s.reason}`).join("\n") || "_aucun_"}

## Contrôle
${report.controlUrls.map((u) => `- ${u}`).join("\n")}

## Règles
- Aucune écriture SumUp
- Aucun produit inventé
- Whitelist stricte des 5 références validées
- \`promotion10mlEligible=false\` (format 50 ml)
`;

  fs.writeFileSync(path.resolve("data/rebuild/RAPPORT_BIARRITZ_MAMITA.md"), md, "utf8");
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
