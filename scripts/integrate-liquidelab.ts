/**
 * Intégration Liquide Lab — gammes GlaGla, Iceberg, Kuix, Péché Gourmand.
 *
 * - UPDATE uniquement des produits SumUp déjà en DB (pas d'invention)
 * - Anti-doublons SumUp / EAN avant publication
 * - Kuix : e-liquides 50 ml publiés ; pods/batteries liés mais hors hub e-liquides
 * - Photos officielles absentes → pending + hors ligne (politique official-sumup)
 * - Noms = SumUp (jamais inventés)
 *
 * Usage: npx tsx scripts/integrate-liquidelab.ts
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import {
  quarantineDuplicateProduct,
  registerOrRejectDuplicate,
} from "../lib/catalog/assert-no-duplicates";
import { resolveEn13, upsertEn13InDescription } from "../lib/catalog/en13";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";

const REPORT_JSON = path.resolve("data/rebuild/RAPPORT_LIQUIDELAB.json");
const REPORT_MD = path.resolve("data/rebuild/RAPPORT_LIQUIDELAB.md");

type RangeDef = {
  masterId: string;
  name: string;
  slug: string;
  family: string;
  formatCodes: string[];
};

const RANGES: RangeDef[] = [
  {
    masterId: "RNG-liquide_lab-glagla",
    name: "GlaGla",
    slug: "glagla",
    family: "LIQUIDELAB_GLAGLA",
    formatCodes: ["50ml"],
  },
  {
    masterId: "RNG-liquide_lab-iceberg",
    name: "Iceberg",
    slug: "iceberg",
    family: "LIQUIDELAB_ICEBERG",
    formatCodes: ["50ml"],
  },
  {
    masterId: "RNG-liquide_lab-kuix",
    name: "Kuix",
    slug: "kuix",
    family: "LIQUIDELAB_KUIX",
    formatCodes: ["50ml"],
  },
  {
    masterId: "RNG-liquide_lab-peche_gourmand",
    name: "Péché Gourmand",
    slug: "peche-gourmand",
    family: "LIQUIDELAB_PECHE_GOURMAND",
    formatCodes: ["50ml"],
  },
];

function detectRange(name: string): RangeDef | null {
  const n = name.toLowerCase();
  if (/glagla|gla\s*gla/.test(n)) return RANGES.find((r) => r.slug === "glagla")!;
  if (/iceberg/.test(n)) return RANGES.find((r) => r.slug === "iceberg")!;
  if (/\bkuix\b/.test(n)) return RANGES.find((r) => r.slug === "kuix")!;
  if (/p[eé]ch[eé]\s*gourmand/.test(n)) return RANGES.find((r) => r.slug === "peche-gourmand")!;
  return null;
}

function classifyKuix(name: string): {
  kind: "eliquide50" | "pod" | "batterie" | "other";
  productType: string | null;
  volumeMl: number | null;
  category: string;
  publishOnline: boolean;
} {
  const n = name.toLowerCase();
  // Kuix e-liquides = 50 ml uniquement. Pods / batteries restent en stock SumUp hors vitrine.
  if (/batterie|battery/.test(n)) {
    return {
      kind: "batterie",
      productType: null,
      volumeMl: null,
      category: "materiel",
      publishOnline: false,
    };
  }
  if (/\b(10|20)\s*mg\b/.test(n) || /fresh\s*(10|20)\s*mg/.test(n)) {
    return {
      kind: "pod",
      productType: null,
      volumeMl: null,
      category: "pods",
      publishOnline: false,
    };
  }
  if (/50\s*ml/.test(n)) {
    return {
      kind: "eliquide50",
      productType: "50ml",
      volumeMl: 50,
      category: "e-liquides",
      publishOnline: true,
    };
  }
  return {
    kind: "other",
    productType: null,
    volumeMl: null,
    category: "autre",
    publishOnline: false,
  };
}

function classify50ml(name: string): {
  productType: string;
  volumeMl: number;
  category: string;
  publishOnline: boolean;
} {
  if (/50\s*ml/.test(name.toLowerCase())) {
    return {
      productType: "50ml",
      volumeMl: 50,
      category: "e-liquides",
      publishOnline: true,
    };
  }
  return {
    productType: "50ml",
    volumeMl: 50,
    category: "e-liquides",
    publishOnline: false,
  };
}

/** Nom affiché = SumUp (jamais inventé). Titre officiel uniquement via official-sumup-policy. */
function displayNameFromSumup(sumupOrDbName: string): string {
  return sumupOrDbName.replace(/\s+/g, " ").trim();
}

function flavorKey(name: string, rangeSlug: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/glagla|iceberg|kuix|peche gourmand|péché gourmand|50\s*ml|-/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    + `::${rangeSlug}::50ml`;
}

async function ensureManufacturerBrandRanges() {
  let manufacturer = await prisma.manufacturer.findUnique({
    where: { slug: "liquide-lab" },
  });
  if (!manufacturer) {
    manufacturer = await prisma.manufacturer.create({
      data: {
        masterId: "MFR-liquide_lab",
        name: "Liquide Lab",
        slug: "liquide-lab",
        website: "https://liquidelab.com/",
        country: "Belgique / France",
        status: "verifie",
        isActive: true,
        sortOrder: 4,
      },
    });
  } else {
    manufacturer = await prisma.manufacturer.update({
      where: { id: manufacturer.id },
      data: {
        name: "Liquide Lab",
        website: manufacturer.website || "https://liquidelab.com/",
        status: "verifie",
        isActive: true,
        masterId: manufacturer.masterId || "MFR-liquide_lab",
      },
    });
  }

  let brand = await prisma.brand.findFirst({
    where: {
      OR: [{ slug: "liquide-lab" }, { name: { equals: "Liquide Lab", mode: "insensitive" } }],
    },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Liquide Lab",
        slug: "liquide-lab",
        manufacturerId: manufacturer.id,
        isActive: true,
      },
    });
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: { manufacturerId: manufacturer.id, isActive: true, name: "Liquide Lab" },
    });
  }

  const ranges: Record<string, { id: string; slug: string; name: string }> = {};
  for (const def of RANGES) {
    let range = await prisma.productRange.findFirst({
      where: {
        slug: def.slug,
        OR: [{ brandId: brand.id }, { manufacturerId: manufacturer.id }],
      },
    });
    if (!range) {
      range = await prisma.productRange.create({
        data: {
          name: def.name,
          slug: def.slug,
          brandId: brand.id,
          manufacturerId: manufacturer.id,
          masterId: def.masterId,
          formatCodes: def.formatCodes,
          status: "verifie",
          isActive: true,
        },
      });
    } else {
      range = await prisma.productRange.update({
        where: { id: range.id },
        data: {
          name: def.name,
          brandId: brand.id,
          manufacturerId: manufacturer.id,
          masterId: def.masterId,
          formatCodes: def.formatCodes,
          status: "verifie",
          isActive: true,
        },
      });
    }
    ranges[def.slug] = { id: range.id, slug: range.slug, name: range.name };
  }

  return { manufacturer, brand, ranges };
}

async function main() {
  const { manufacturer, brand, ranges } = await ensureManufacturerBrandRanges();

  const candidates = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "GlaGla", mode: "insensitive" } },
        { name: { contains: "Glagla", mode: "insensitive" } },
        { name: { contains: "Iceberg", mode: "insensitive" } },
        { name: { contains: "Kuix", mode: "insensitive" } },
        { name: { contains: "Péché Gourmand", mode: "insensitive" } },
        { name: { contains: "Peche gourmand", mode: "insensitive" } },
        { name: { contains: "Peche Gourmand", mode: "insensitive" } },
        { productFamily: { startsWith: "LIQUIDELAB_" } },
      ],
    },
    orderBy: [{ stock: "desc" }, { name: "asc" }],
  });

  const published: Array<Record<string, unknown>> = [];
  const linkedOffline: Array<Record<string, unknown>> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const quarantined: Array<{ name: string; reason: string }> = [];

  const seenSumup = new Set<string>();
  const seenBarcode = new Set<string>();
  const seenFlavor = new Set<string>();

  for (const p of candidates) {
    const rangeDef = detectRange(p.name);
    if (!rangeDef) {
      skipped.push({ name: p.name, reason: "hors_gammes_cible" });
      continue;
    }

    // Filtrer faux positifs "gourmand" hors Péché Gourmand
    if (
      rangeDef.slug === "peche-gourmand" &&
      !/p[eé]ch[eé]\s*gourmand/i.test(p.name)
    ) {
      skipped.push({ name: p.name, reason: "faux_positif_gourmand" });
      continue;
    }

    if (!p.sumupProductId) {
      skipped.push({ name: p.name, reason: "sans_sumup" });
      continue;
    }
    if (!p.priceCents || p.priceCents <= 0) {
      skipped.push({ name: p.name, reason: "prix" });
      continue;
    }

    const sumupOk = registerOrRejectDuplicate(seenSumup, p.sumupProductId, "sumup");
    if (!sumupOk.ok) {
      await quarantineDuplicateProduct(prisma, p.id, sumupOk.reason);
      quarantined.push({ name: p.name, reason: sumupOk.reason });
      continue;
    }

    const en13 = resolveEn13({
      officialBarcode: null,
      existingBarcode: p.barcode,
      description: p.description,
    });
    if (en13.barcode) {
      const barOk = registerOrRejectDuplicate(seenBarcode, en13.barcode, "ean");
      if (!barOk.ok) {
        await quarantineDuplicateProduct(prisma, p.id, barOk.reason);
        quarantined.push({ name: p.name, reason: barOk.reason });
        continue;
      }
    }

    const range = ranges[rangeDef.slug];
    let productType: string | null = null;
    let volumeMl: number | null = null;
    let category = "e-liquides";
    let publishOnline = false;
    let kind = "eliquide50";

    if (rangeDef.slug === "kuix") {
      const k = classifyKuix(p.name);
      productType = k.productType;
      volumeMl = k.volumeMl;
      category = k.category;
      publishOnline = k.publishOnline;
      kind = k.kind;
    } else {
      const k = classify50ml(p.name);
      productType = k.productType;
      volumeMl = k.volumeMl;
      category = k.category;
      publishOnline = k.publishOnline;
      kind = "eliquide50";
    }

    if (kind === "eliquide50") {
      const fk = flavorKey(p.name, rangeDef.slug);
      const flavorOk = registerOrRejectDuplicate(seenFlavor, fk, "flavor");
      if (!flavorOk.ok) {
        await quarantineDuplicateProduct(prisma, p.id, flavorOk.reason);
        quarantined.push({ name: p.name, reason: flavorOk.reason });
        continue;
      }
    }

    const sumupLabel = (p.sumupName || p.name).replace(/\s+/g, " ").trim();
    const name = displayNameFromSumup(sumupLabel);
    const description = upsertEn13InDescription(p.description, en13.barcode);

    const gate = evaluateEliquidePublishGate({
      category,
      productType,
      volumeMl,
      name,
      sumupName: sumupLabel,
      sumupProductId: p.sumupProductId,
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
    });

    const canPublish =
      publishOnline &&
      kind === "eliquide50" &&
      productType === "50ml" &&
      gate.canPublishOnline;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name,
        sumupName: sumupLabel,
        description,
        barcode: en13.barcode || p.barcode,
        brand: "Liquide Lab",
        range: rangeDef.name,
        productFamily: rangeDef.family,
        category,
        productType,
        volumeMl,
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        rangeId: range.id,
        isActive: true,
        visibleOnline: canPublish,
        catalogStatus: canPublish ? "valide" : "a_verifier",
        importAnomaly: canPublish
          ? null
          : gate.anomalies.join("|") || `incomplet:${kind}`,
        promotion10mlEligible: false,
        sumupLastSync: new Date(),
      },
    });

    const row = {
      id: p.id,
      name,
      slug: p.slug,
      range: rangeDef.slug,
      kind,
      productType,
      priceCents: p.priceCents,
      barcode: en13.barcode,
      visibleOnline: canPublish,
      imageStatus: p.imageStatus,
    };

    if (canPublish) published.push(row);
    else linkedOffline.push(row);
  }

  const byRange: Record<string, number> = {};
  for (const p of published) {
    const key = String(p.range);
    byRange[key] = (byRange[key] || 0) + 1;
  }

  const report = {
    date: new Date().toISOString(),
    fabricant: "Liquide Lab",
    slug: "liquide-lab",
    gammes: RANGES.map((r) => r.name),
    publishedCount: published.length,
    linkedOfflineCount: linkedOffline.length,
    skippedCount: skipped.length,
    quarantinedCount: quarantined.length,
    byRange,
    published,
    linkedOffline,
    skipped,
    quarantined,
    controlUrls: [
      "http://localhost:3000/e-liquides",
      "http://localhost:3000/fabricants/liquide-lab",
      "http://localhost:3000/gammes/glagla?fabricant=liquide-lab",
      "http://localhost:3000/gammes/iceberg?fabricant=liquide-lab",
      "http://localhost:3000/gammes/kuix?fabricant=liquide-lab",
      "http://localhost:3000/gammes/peche-gourmand?fabricant=liquide-lab",
    ],
    notes: [
      "Photos packshot officielles à compléter (site Liquide Lab sans catalogue scrapeable).",
      "Doublons Iceberg Citron Orange / Kuix : quarantaine du second EAN.",
      "Kuix pods & batteries publiés hors catégorie e-liquides.",
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");

  const md = [
    `# Rapport intégration Liquide Lab — ${report.date}`,
    "",
    `- Publiés en ligne : **${report.publishedCount}**`,
    `- Liés hors ligne / incomplets : **${report.linkedOfflineCount}**`,
    `- Ignorés : **${report.skippedCount}**`,
    `- Quarantaine doublons : **${report.quarantinedCount}**`,
    "",
    "## Par gamme (publiés)",
    ...Object.entries(byRange).map(([k, v]) => `- ${k} : ${v}`),
    "",
    "## URLs",
    ...report.controlUrls.map((u) => `- ${u}`),
    "",
  ].join("\n");
  fs.writeFileSync(REPORT_MD, md, "utf8");

  console.log(JSON.stringify({
    ok: true,
    publishedCount: report.publishedCount,
    linkedOfflineCount: report.linkedOfflineCount,
    quarantinedCount: report.quarantinedCount,
    byRange,
    report: REPORT_MD,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
