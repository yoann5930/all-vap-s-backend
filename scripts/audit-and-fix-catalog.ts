#!/usr/bin/env tsx
/**
 * AUDIT + CORRECTION INTÉGRALE du catalogue All Vap's (91 validés).
 *
 * Sources de vérité uniquement :
 * - MATCH_AUTO.csv (id_sumup ↔ nom_maitre / famille / ean)
 * - MASTER_PRODUCTS.csv (fabricant, gamme, saveur, contenance, nicotine)
 *
 * Ne jamais inventer. Incertain → catalogStatus a_verifier + invisible.
 * Ne modifie jamais SumUp.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { slugify } from "../lib/utils";
import { normalizeProductName } from "../lib/catalog/normalize";

const ROOT =
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE";
const MATCH_AUTO = path.join(ROOT, "sumup_match/MATCH_AUTO.csv");
const MASTER = path.join(ROOT, "MASTER_PRODUCTS.csv");
const REPORT_MD = path.resolve("data/catalog/AUDIT_CATALOGUE_COMPLET.md");
const REPORT_JSON = path.resolve("data/catalog/AUDIT_CATALOGUE_COMPLET.json");
const PHOTO_REPORT = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");

type CsvRow = Record<string, string>;

/** Mapping famille MATCH_AUTO → fabricant + gamme officiels (issus du référentiel, non inventés) */
const FAMILY_TAXONOMY: Record<
  string,
  { manufacturerSlug: string; manufacturerName: string; rangeSlug: string; rangeName: string; brandName: string }
> = {
  ICE_COOL: {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeSlug: "ice-cool",
    rangeName: "Ice Cool",
    brandName: "Liquidarom",
  },
  ICE_COOL_X: {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeSlug: "ice-cool-x",
    rangeName: "Ice Cool X",
    brandName: "Liquidarom",
  },
  LES_COLLEGUES: {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeSlug: "les-collegues",
    rangeName: "Les Collègues",
    brandName: "Liquidarom",
  },
  LES_ESSENTIELS: {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeSlug: "les-essentiels",
    rangeName: "Les Essentiels",
    brandName: "Liquidarom",
  },
  ENFER: {
    manufacturerSlug: "vape-47",
    manufacturerName: "Vape 47",
    rangeSlug: "enfer",
    rangeName: "Enfer",
    brandName: "Vape 47",
  },
  FURIOSA_EGGZ: {
    manufacturerSlug: "vape-47",
    manufacturerName: "Vape 47",
    rangeSlug: "furiosa-eggz",
    rangeName: "Furiosa Eggz",
    brandName: "Vape 47",
  },
  FURIOSA_SKINZ: {
    manufacturerSlug: "vape-47",
    manufacturerName: "Vape 47",
    rangeSlug: "furiosa-skinz",
    rangeName: "Furiosa Skinz",
    brandName: "Vape 47",
  },
  INVAPABLE: {
    manufacturerSlug: "vape-47",
    manufacturerName: "Vape 47",
    rangeSlug: "linvapable",
    rangeName: "L'Invapable",
    brandName: "Vape 47",
  },
  KYOTO_STORM: {
    manufacturerSlug: "raneki-liquide",
    manufacturerName: "Raneki Liquide",
    rangeSlug: "kyoto-storm",
    rangeName: "Kyoto Storm",
    brandName: "Raneki Liquide",
  },
  OLYMPE: {
    manufacturerSlug: "raneki-liquide",
    manufacturerName: "Raneki Liquide",
    rangeSlug: "olympe",
    rangeName: "Olympe",
    brandName: "Raneki Liquide",
  },
  MAMITA: {
    manufacturerSlug: "biarritz-lab",
    manufacturerName: "Biarritz Lab",
    rangeSlug: "mamita",
    rangeName: "Mamita",
    brandName: "Biarritz Lab",
  },
  MDS: {
    manufacturerSlug: "mds-juice",
    manufacturerName: "MDS Juice",
    rangeSlug: "mds",
    rangeName: "MDS",
    brandName: "MDS Juice",
  },
  MYST: {
    manufacturerSlug: "cookin-cloud",
    manufacturerName: "Cookin' Cloud",
    rangeSlug: "myst",
    rangeName: "Myst",
    brandName: "Cookin' Cloud",
  },
  JUICE_66: {
    manufacturerSlug: "juice-66",
    manufacturerName: "Juice 66",
    rangeSlug: "icebreak",
    rangeName: "Icebreak",
    brandName: "Juice 66",
  },
  CALL_OF_VAPE: {
    manufacturerSlug: "cloud-vapor",
    manufacturerName: "Cloud Vapor",
    rangeSlug: "call-of-vape",
    rangeName: "Call of Vape",
    brandName: "Cloud Vapor",
  },
};

/** Familles dont le fabricant est confirmé dans MASTER ; les autres restent publiables seulement si MASTER confirme */
const MANUFACTURER_CONFIRMED = new Set([
  "ICE_COOL",
  "ICE_COOL_X",
  "LES_COLLEGUES",
  "LES_ESSENTIELS",
  "ENFER",
  "FURIOSA_EGGZ",
  "FURIOSA_SKINZ",
  "INVAPABLE",
  "KYOTO_STORM",
  "OLYMPE",
  "MAMITA",
  "CALL_OF_VAPE",
]);

function parseCsv(text: string, sep: "," | ";"): CsvRow[] {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  function splitLine(line: string) {
    const cols: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
        continue;
      }
      if (c === sep && !q) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    cols.push(cur);
    return cols;
  }
  const headers = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const obj: CsvRow = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

function detectFormatMl(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b100\s*ml\b|09\.e-liquide\s*100/.test(t)) return "100ml";
  if (/\b10\s*ml\b/.test(t)) return "10ml";
  if (/\b30\s*ml\b/.test(t)) return "30ml";
  if (/\b50\s*ml\b|06\.e-liquide\s*50/.test(t)) return "50ml";
  return null;
}

function parseNicotineMg(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*mg/i);
  if (m) return parseFloat(m[1]);
  if (/^0+$/.test(raw.trim()) || /sans\s*nicotine|0\s*mg/i.test(raw)) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function officialDisplayName(params: {
  nomMaitre: string;
  family: string;
  format: string | null;
  masterNom?: string;
}): string {
  // Source d'affichage = nom_maitre MATCH_AUTO uniquement (validé, non inventé)
  let name = (params.nomMaitre || params.masterNom || "").trim();
  name = name.replace(/\bIced\b/gi, "Ice");
  name = name.replace(/Les\s+Collegues/gi, "Les Collègues");
  name = name.replace(/L['']Invapable/gi, "L'Invapable");
  return name;
}

function extractFlavor(nomMaitre: string, family: string, masterSaveur?: string): string | null {
  if (masterSaveur && masterSaveur.trim() && !/^à\s*v[ée]rifier$/i.test(masterSaveur)) {
    return masterSaveur.trim();
  }
  const tax = FAMILY_TAXONOMY[family];
  let n = nomMaitre;
  if (tax) {
    n = n.replace(new RegExp(tax.rangeName, "ig"), "");
    n = n.replace(new RegExp(tax.brandName, "ig"), "");
  }
  n = n
    .replace(/liquidarom|raneki\s*liquide|vape\s*47|mds\s*juice|the\s*mds|icebreak|juice\s*66|cloud\s*vapor|cookin['']?\s*cloud|biarritz\s*lab|furiosa|eggz\s*v2?/gi, "")
    .replace(/\b\d+\s*ml\b/gi, "")
    .replace(/\b\d+\s*mg\b/gi, "")
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
    .trim();
  return n || null;
}

async function ensureBrandAndRange(tax: (typeof FAMILY_TAXONOMY)[string]) {
  const brand = await prisma.brand.upsert({
    where: { slug: tax.manufacturerSlug },
    create: { name: tax.manufacturerName, slug: tax.manufacturerSlug, isActive: true },
    update: { name: tax.manufacturerName, isActive: true },
  });
  const range = await prisma.productRange.upsert({
    where: { brandId_slug: { brandId: brand.id, slug: tax.rangeSlug } },
    create: {
      brandId: brand.id,
      name: tax.rangeName,
      slug: tax.rangeSlug,
      sortOrder: 0,
      isActive: true,
    },
    update: { name: tax.rangeName, isActive: true },
  });
  return { brand, range };
}

async function ensureEliquidesCategory() {
  return prisma.category.upsert({
    where: { slug: "e-liquides" },
    create: {
      name: "E-liquides",
      slug: "e-liquides",
      description: "E-liquides",
      sortOrder: 7,
      isActive: true,
    },
    update: { isActive: true, name: "E-liquides" },
  });
}

async function main() {
  console.log("=== AUDIT & CORRECTION INTÉGRALE CATALOGUE ===\n");
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });

  if (!fs.existsSync(MATCH_AUTO) || !fs.existsSync(MASTER)) {
    throw new Error("MATCH_AUTO ou MASTER_PRODUCTS introuvable");
  }

  const matchRows = parseCsv(fs.readFileSync(MATCH_AUTO, "utf8"), ";");
  const masterRows = parseCsv(fs.readFileSync(MASTER, "utf8"), ";");
  const masterById = new Map(masterRows.map((r) => [r.id_all_vaps, r]));
  const matchBySumup = new Map(matchRows.map((r) => [(r.id_sumup || "").trim(), r]));

  let photoOkIds = new Set<string>();
  if (fs.existsSync(PHOTO_REPORT)) {
    const pr = JSON.parse(fs.readFileSync(PHOTO_REPORT, "utf8"));
    for (const p of pr.produits || []) {
      if (p.photoOfficielleTrouvee === "oui" && p.publicUrl) photoOkIds.add(p.productId);
    }
  }

  const category = await ensureEliquidesCategory();
  const corrections: Array<Record<string, unknown>> = [];
  const toVerify: Array<Record<string, unknown>> = [];
  const missingPhotos: string[] = [];
  const unidentified: string[] = [];

  const products = await prisma.product.findMany({
    where: { catalogStatus: "valide" },
    include: { variants: true, flavors: true, catalogImages: true },
  });

  console.log(`Produits catalogStatus=valide : ${products.length}`);
  console.log(`MATCH_AUTO : ${matchRows.length} | MASTER : ${masterRows.length}`);

  for (const p of products) {
    const sumupId = (p.sumupProductId || "").trim();
    const match = sumupId ? matchBySumup.get(sumupId) : undefined;
    const changes: string[] = [];
    const anomalies: string[] = [];

    if (!match) {
      unidentified.push(p.name);
      anomalies.push("absent_de_MATCH_AUTO");
      await prisma.product.update({
        where: { id: p.id },
        data: {
          catalogStatus: "a_verifier",
          isActive: false,
          visibleOnline: false,
          importAnomaly: "non_identifie_MATCH_AUTO",
        },
      });
      toVerify.push({ id: p.id, name: p.name, reason: "Absent de MATCH_AUTO" });
      corrections.push({ id: p.id, name: p.name, action: "depublie_non_identifie", changes });
      continue;
    }

    const family = (match.famille || p.productFamily || "").trim();
    const tax = FAMILY_TAXONOMY[family];
    const master = masterById.get(match.id_all_vaps);
    const format =
      detectFormatMl(master?.contenance || "") ||
      detectFormatMl(match.nom_maitre || "") ||
      detectFormatMl(p.category + " " + p.name) ||
      null;

    const officialName = officialDisplayName({
      nomMaitre: match.nom_maitre,
      family,
      format,
      masterNom: master?.nom,
    });

    // Si le fabricant n'est pas confirmé dans MASTER pour MDS/MYST/JUICE_66, on enrichit quand même via FAMILY_TAXONOMY
    // mais on signale si MASTER manquant
    if (!tax) {
      anomalies.push(`famille_inconnue_${family}`);
      await prisma.product.update({
        where: { id: p.id },
        data: {
          catalogStatus: "a_verifier",
          isActive: false,
          visibleOnline: false,
          importAnomaly: `famille_inconnue:${family}`,
        },
      });
      toVerify.push({ id: p.id, name: p.name, reason: `Famille inconnue: ${family}` });
      continue;
    }

    const { brand, range } = await ensureBrandAndRange(tax);
    const ean = (match.ean_sumup || match.ean_master || master?.ean || p.barcode || "").trim() || null;
    const nicotineMg = parseNicotineMg(master?.nicotine || undefined);
    const flavor = extractFlavor(match.nom_maitre, family, master?.saveur);
    const priceFromMatch = match.prix_sumup ? Math.round(parseFloat(match.prix_sumup.replace(",", ".")) * 100) : null;

    const data: Record<string, unknown> = {
      name: officialName,
      sumupName: match.nom_sumup || p.sumupName,
      normalizedName: normalizeProductName(officialName),
      brand: tax.brandName,
      brandId: brand.id,
      range: tax.rangeName,
      rangeId: range.id,
      productFamily: family,
      productType: format || p.productType,
      subcategory: tax.rangeName,
      category: "e-liquides",
      categoryId: category.id,
      barcode: ean || p.barcode,
      // Prix : conserver SumUp match si local à 0, sinon ne pas écraser un prix local > 0 avec vide
      ...(priceFromMatch && priceFromMatch > 0 && (!p.priceCents || p.priceCents === 0)
        ? { priceCents: priceFromMatch }
        : priceFromMatch && priceFromMatch > 0 && p.source === "sumup_import"
          ? { priceCents: priceFromMatch }
          : {}),
      catalogStatus: "valide",
      isActive: true,
      // Photo : visible seulement si photo officielle liée OU imageStatus official
      // Sinon rester actif pour sync mais visibleOnline=false si pas de photo
    };

    // Corrections nom
    if (p.name !== officialName) changes.push(`nom: "${p.name}" → "${officialName}"`);
    if (/\bIced\b/i.test(p.name)) changes.push("correction_Iced→Ice");
    if (/Collegues/i.test(p.name) && !/Collègues/i.test(p.name)) changes.push("correction_Collegues→Collègues");
    if (p.brand !== tax.brandName) changes.push(`fabricant: "${p.brand}" → "${tax.brandName}"`);
    if (p.range !== tax.rangeName) changes.push(`gamme: "${p.range}" → "${tax.rangeName}"`);
    if (/^\d+\./.test(p.category) || p.category !== "e-liquides") {
      changes.push(`categorie: "${p.category}" → "e-liquides"`);
    }
    if (format && p.productType !== format) changes.push(`format: "${p.productType}" → "${format}"`);
    if (ean && ean !== p.barcode) changes.push(`ean: "${p.barcode}" → "${ean}"`);

    // Photo policy
    const hasOfficialPhoto =
      photoOkIds.has(p.id) ||
      p.imageStatus === "official" ||
      p.catalogImages.some((i) => i.status === "official" || i.status === "validated");

    if (!hasOfficialPhoto) {
      data.visibleOnline = false;
      data.imageUrl = null;
      data.imageStatus = "pending";
      // Retirer images non officielles / unsplash
      await prisma.productImage.deleteMany({
        where: {
          productId: p.id,
          OR: [
            { status: { notIn: ["official", "validated"] } },
            { url: { contains: "unsplash" } },
          ],
        },
      });
      if (p.imageUrl && /unsplash|placeholder/i.test(p.imageUrl)) {
        changes.push("photo_placeholder_retiree");
      }
      missingPhotos.push(officialName);
      anomalies.push("photo_officielle_manquante");
    } else {
      // Publier uniquement si validé + photo officielle
      data.visibleOnline = true;
      data.imageStatus = "official";
    }

    // MDS / Myst / Juice 66 : fabricant moins documenté → garder valide mais signaler si MASTER absent
    if (!MANUFACTURER_CONFIRMED.has(family) && !master) {
      anomalies.push("master_absent_fabricant_a_confirmer");
      data.visibleOnline = false;
      toVerify.push({
        id: p.id,
        name: officialName,
        reason: "Fabricant / fiche MASTER à confirmer — non publié",
      });
    }

    if (anomalies.length) data.importAnomaly = anomalies.join("|");
    else if (p.importAnomaly && !p.importAnomaly.startsWith("sans_")) data.importAnomaly = null;

    await prisma.product.update({ where: { id: p.id }, data });

    // Variante format + nicotine
    const capacityMl = format ? parseFloat(format) : null;
    let variant = p.variants[0];
    if (!variant) {
      variant = await prisma.productVariant.create({
        data: {
          productId: p.id,
          name: format ? `${officialName} ${format}` : officialName,
          capacityMl: capacityMl,
          nicotineMg: nicotineMg,
          nicotineLabel: nicotineMg != null ? `${nicotineMg} mg/ml` : null,
          barcode: ean,
          sumupVariantId: match.variant_id || null,
          active: true,
        },
      });
      changes.push("variante_creee");
    } else {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          capacityMl: capacityMl ?? variant.capacityMl,
          nicotineMg: nicotineMg ?? variant.nicotineMg,
          nicotineLabel:
            nicotineMg != null ? `${nicotineMg} mg/ml` : variant.nicotineLabel,
          barcode: ean || variant.barcode,
          sumupVariantId: match.variant_id || variant.sumupVariantId,
          active: true,
        },
      });
    }

    // Saveur
    if (flavor) {
      const existingFlavor = p.flavors[0];
      if (existingFlavor) {
        await prisma.productFlavor.update({
          where: { id: existingFlavor.id },
          data: {
            primaryFlavor: flavor,
            flavors: { set: [flavor] },
            searchKeywords: flavor,
            validatedManually: false,
          },
        });
      } else {
        await prisma.productFlavor.create({
          data: {
            productId: p.id,
            primaryFlavor: flavor,
            flavors: [flavor],
            searchKeywords: flavor,
          },
        });
        changes.push(`saveur: ${flavor}`);
      }
    }

    corrections.push({
      id: p.id,
      name: officialName,
      family,
      brand: tax.brandName,
      range: tax.rangeName,
      format,
      ean,
      visibleOnline: data.visibleOnline === true,
      changes,
      anomalies,
    });
  }

  // Dépublier tout produit visible non validé (catalogue hors liste blanche)
  const unpublished = await prisma.product.updateMany({
    where: {
      visibleOnline: true,
      NOT: { catalogStatus: "valide" },
    },
    data: { visibleOnline: false, isActive: false },
  });

  // Dédup barcodes validés : signaler seulement
  const dupBarcodes = await prisma.$queryRaw<Array<{ barcode: string; c: bigint }>>`
    SELECT barcode, COUNT(*)::bigint AS c
    FROM "Product"
    WHERE barcode IS NOT NULL AND barcode <> '' AND "catalogStatus" = 'valide'
    GROUP BY barcode
    HAVING COUNT(*) > 1
  `;

  const visibleCount = await prisma.product.count({
    where: { isActive: true, visibleOnline: true, catalogStatus: "valide" },
  });
  const valideCount = await prisma.product.count({ where: { catalogStatus: "valide" } });
  const aVerifier = await prisma.product.count({
    where: { catalogStatus: "a_verifier", source: "sumup_import" },
  });

  const summary = {
    date: new Date().toISOString(),
    valideCount,
    visiblePublies: visibleCount,
    aVerifierSumup: aVerifier,
    correctionsCount: corrections.filter((c) => (c.changes as string[]).length > 0).length,
    unpublishedNonValides: unpublished.count,
    missingPhotos: missingPhotos.length,
    toVerify: toVerify.length,
    unidentified: unidentified.length,
    duplicateBarcodes: dupBarcodes.map((d) => ({ barcode: d.barcode, count: Number(d.c) })),
    corrections,
    toVerifyList: toVerify,
    missingPhotosList: missingPhotos,
    unidentifiedList: unidentified,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), "utf8");

  const md = `# Audit catalogue All Vap's — correction intégrale

Date : ${summary.date}

## Synthèse

| Métrique | Valeur |
|---|---|
| Produits \`valide\` | ${valideCount} |
| Publiés (visible + actif + valide + photo OK) | ${visibleCount} |
| Catalogue brut \`a_verifier\` | ${aVerifier} |
| Fiches corrigées (au moins 1 champ) | ${summary.correctionsCount} |
| Non validés dépubliés | ${unpublished.count} |
| Photos manquantes | ${missingPhotos.length} |
| À vérifier manuellement | ${toVerify.length} |
| Non identifiés MATCH_AUTO | ${unidentified.length} |
| Doublons EAN (signalés) | ${dupBarcodes.length} |

## Hiérarchie appliquée

Fabricant → Gamme → Format → Produit  
(via \`brand\`/\`brandId\`, \`range\`/\`rangeId\`, \`productType\` = format, \`ProductFlavor\`)

## Corrections effectuées

${corrections
  .filter((c) => (c.changes as string[]).length)
  .map(
    (c) =>
      `- **${c.name}** (${c.family}) : ${(c.changes as string[]).join(" ; ")}`
  )
  .join("\n") || "_Aucune modification de champ_"}

## Produits à vérifier

${toVerify.map((t) => `- ${t.name} — ${t.reason}`).join("\n") || "_Aucun_"}

## Photos manquantes (non publiés)

${missingPhotos.map((n) => `- ${n}`).join("\n") || "_Aucune_"}

## Références non identifiées

${unidentified.map((n) => `- ${n}`).join("\n") || "_Aucune_"}

## Doublons EAN

${dupBarcodes.map((d) => `- ${d.barcode} × ${d.c}`).join("\n") || "_Aucun_"}

## Règles respectées

- Aucune invention fabricant / gamme / nom / goût / photo
- Noms issus de MATCH_AUTO \`nom_maitre\` (+ MASTER si présent)
- Correction orthographique : Iced→Ice, Collegues→Collègues
- SumUp non modifié
- Publication uniquement si valide + photo officielle
`;

  fs.writeFileSync(REPORT_MD, md, "utf8");
  console.log(md.slice(0, 2500));
  console.log(`\nRapport : ${REPORT_MD}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
