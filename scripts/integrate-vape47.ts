/**
 * Intégration Vape 47 — Enfer, Les Fruits d'Enfer, L'Invapable, Furiosa (Eggz + Skinz).
 *
 * - UPDATE SumUp existants uniquement
 * - Anti-doublons SumUp / EAN / saveur+format
 * - Pas de collabs Fighter Fuel / fiches description corrompues
 *
 * Usage: npx tsx scripts/integrate-vape47.ts
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

const REPORT_JSON = path.resolve("data/rebuild/RAPPORT_VAPE47.json");
const REPORT_MD = path.resolve("data/rebuild/RAPPORT_VAPE47.md");

type RangeDef = {
  masterId: string;
  name: string;
  slug: string;
  family: string;
  formatCodes: string[];
};

const RANGES: RangeDef[] = [
  {
    masterId: "RNG-vape_47-enfer",
    name: "Enfer",
    slug: "enfer",
    family: "ENFER",
    formatCodes: ["50ml"],
  },
  {
    masterId: "RNG-vape_47-fruits_d_enfer",
    name: "Les Fruits d'Enfer",
    slug: "les-fruits-d-enfer",
    family: "FRUITS_D_ENFER",
    formatCodes: ["50ml"],
  },
  {
    masterId: "RNG-vape_47-linvapable",
    name: "L'Invapable",
    slug: "linvapable",
    family: "INVAPABLE",
    formatCodes: ["50ml", "100ml"],
  },
  {
    masterId: "RNG-vape_47-furiosa_eggz",
    name: "Furiosa Eggz",
    slug: "furiosa-eggz",
    family: "FURIOSA_EGGZ",
    formatCodes: ["50ml"],
  },
  {
    masterId: "RNG-vape_47-furiosa_skinz",
    name: "Furiosa Skinz",
    slug: "furiosa-skinz",
    family: "FURIOSA_SKINZ",
    formatCodes: ["50ml", "100ml"],
  },
];

function isGarbageName(name: string): boolean {
  const n = name.trim();
  if (n.length > 120) return true;
  if (/découvrez cette collaboration|un mélange qui allie|vivez une expérience/i.test(n)) {
    return true;
  }
  if (/^saveur\s*:/i.test(n)) return true;
  if (/,Yes,,https?:\/\//i.test(n)) return true;
  return false;
}

function detectRange(
  p: { name: string; productFamily: string | null; brand: string | null; range: string | null }
): RangeDef | null {
  const n = p.name.toLowerCase();
  const fam = (p.productFamily || "").toUpperCase();
  const brand = (p.brand || "").toLowerCase();
  const range = (p.range || "").toLowerCase();

  if (isGarbageName(p.name)) return null;
  if (/fighter\s*fuel|yuko/i.test(n)) return null;

  // Les Fruits d'Enfer (avant Enfer générique)
  if (
    fam === "FRUITS_D_ENFER" ||
    /fruits?\s+d['’]?\s*enfer/i.test(n) ||
    /\b(la|le)\s+\w+(\s+\w+)?\s+d\s*['’]?\s*enfer\b/i.test(n)
  ) {
    return RANGES.find((r) => r.slug === "les-fruits-d-enfer")!;
  }

  if (
    fam === "INVAPABLE" ||
    /invapable/i.test(n) ||
    /invapable/i.test(brand) ||
    /invapable/i.test(range)
  ) {
    return RANGES.find((r) => r.slug === "linvapable")!;
  }

  if (
    fam === "FURIOSA_SKINZ" ||
    /furiosa\s*skinz|skinz.*furiosa|skinz\s+grok/i.test(n) ||
    (/kaiser/i.test(n) && (/skinz|furiosa|vape\s*47/i.test(n + brand + range) || fam.includes("SKINZ")))
  ) {
    return RANGES.find((r) => r.slug === "furiosa-skinz")!;
  }

  if (
    fam === "FURIOSA_EGGZ" ||
    /furiosa\s*eggz|furioza/i.test(n) ||
    /furiosa\s*eggz/i.test(range)
  ) {
    return RANGES.find((r) => r.slug === "furiosa-eggz")!;
  }

  // Furiosa Eggz mono-noms déjà en famille ou range DB
  if (
    /furiosa eggz/i.test(range) ||
    (fam === "FURIOSA_EGGZ")
  ) {
    return RANGES.find((r) => r.slug === "furiosa-eggz")!;
  }

  if (
    fam === "ENFER" ||
    /^enfer(\s|-)/i.test(n) ||
    /\b50\s*ml\s*-\s*enfer\b/i.test(n) ||
    /enfer\s*-\s*enfer/i.test(n) ||
    (/^dragon\s*50\s*ml\s*-\s*enfer$/i.test(n))
  ) {
    if (/concentr[eé]/i.test(n)) return null; // DIY hors pass e-liquides
    return RANGES.find((r) => r.slug === "enfer")!;
  }

  // Mono-noms Furiosa Eggz déjà liés (Aria, Doom…)
  if (
    /furiosa eggz/i.test(range) ||
    /furiosa eggz/i.test(brand)
  ) {
    return RANGES.find((r) => r.slug === "furiosa-eggz")!;
  }

  return null;
}

function classifyFormat(name: string, productType: string | null): {
  productType: string | null;
  volumeMl: number | null;
  category: string;
  publishOnline: boolean;
} {
  const n = name.toLowerCase();
  if (/concentr[eé]/i.test(n)) {
    return { productType: "30ml", volumeMl: 30, category: "diy", publishOnline: false };
  }
  if (productType === "100ml" || /100\s*ml|80\s*ml/.test(n)) {
    return { productType: "100ml", volumeMl: 100, category: "e-liquides", publishOnline: true };
  }
  if (productType === "50ml" || /50\s*ml/.test(n)) {
    return { productType: "50ml", volumeMl: 50, category: "e-liquides", publishOnline: true };
  }
  // Kaiser Skinz sans type → 100 ml SumUp
  if (/kaiser|skinz/i.test(n)) {
    return { productType: "100ml", volumeMl: 100, category: "e-liquides", publishOnline: true };
  }
  if (productType && /^\d+ml$/i.test(productType)) {
    const ml = parseInt(productType, 10);
    return {
      productType,
      volumeMl: ml,
      category: "e-liquides",
      publishOnline: ml === 50 || ml === 100,
    };
  }
  return { productType: null, volumeMl: null, category: "e-liquides", publishOnline: false };
}

/** Nom affiché = SumUp (jamais inventé). */
function displayNameFromSumup(sumupOrDbName: string): string {
  return sumupOrDbName.replace(/\s+/g, " ").trim();
}

function flavorKey(name: string, rangeSlug: string, productType: string | null): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/enfer|invapable|furiosa|eggz|skinz|vape\s*47|50\s*ml|100\s*ml|80\s*ml|-/gi, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, "-") + `::${rangeSlug}::${productType || "x"}`
  );
}

async function ensureManufacturerBrandRanges() {
  let manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "vape-47" } });
  if (!manufacturer) {
    manufacturer = await prisma.manufacturer.create({
      data: {
        masterId: "MFR-vape_47",
        name: "Vape 47",
        slug: "vape-47",
        website: "https://www.vape47.com/",
        country: "France",
        status: "verifie",
        isActive: true,
        sortOrder: 9,
      },
    });
  } else {
    manufacturer = await prisma.manufacturer.update({
      where: { id: manufacturer.id },
      data: {
        status: "verifie",
        isActive: true,
        website: manufacturer.website || "https://www.vape47.com/",
        masterId: manufacturer.masterId || "MFR-vape_47",
      },
    });
  }

  let brand = await prisma.brand.findFirst({
    where: {
      OR: [{ slug: "vape-47" }, { name: { equals: "Vape 47", mode: "insensitive" } }],
    },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Vape 47",
        slug: "vape-47",
        manufacturerId: manufacturer.id,
        isActive: true,
      },
    });
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: { manufacturerId: manufacturer.id, isActive: true },
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
      // parfois brand-spécifique (enfer, linvapable…)
      range = await prisma.productRange.findFirst({
        where: { slug: def.slug, manufacturerId: manufacturer.id },
      });
    }
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
          manufacturerId: manufacturer.id,
          brandId: range.brandId || brand.id,
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
        { manufacturerId: manufacturer.id },
        { productFamily: { in: ["ENFER", "INVAPABLE", "FURIOSA_EGGZ", "FURIOSA_SKINZ", "FRUITS_D_ENFER"] } },
        { name: { contains: "Enfer", mode: "insensitive" } },
        { name: { contains: "Invapable", mode: "insensitive" } },
        { name: { contains: "Furiosa", mode: "insensitive" } },
        { name: { contains: "d enfer", mode: "insensitive" } },
        { name: { contains: "Skinz", mode: "insensitive" } },
        { range: { contains: "Enfer", mode: "insensitive" } },
        { range: { contains: "Furiosa", mode: "insensitive" } },
        { range: { contains: "Invapable", mode: "insensitive" } },
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
    const rangeDef = detectRange(p);
    if (!rangeDef) {
      skipped.push({ name: p.name.slice(0, 80), reason: "hors_gammes_ou_garbage" });
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

    const fmt = classifyFormat(p.name, p.productType);
    const flavorOk = registerOrRejectDuplicate(
      seenFlavor,
      flavorKey(p.name, rangeDef.slug, fmt.productType),
      "flavor"
    );
    if (!flavorOk.ok) {
      // Ultron V2 doublon → quarantine
      await quarantineDuplicateProduct(prisma, p.id, flavorOk.reason);
      quarantined.push({ name: p.name, reason: flavorOk.reason });
      continue;
    }

    const range = ranges[rangeDef.slug];
    const sumupLabel = (p.sumupName || p.name).replace(/\s+/g, " ").trim();
    const name = displayNameFromSumup(sumupLabel);
    const description = upsertEn13InDescription(p.description, en13.barcode);
    const gate = evaluateEliquidePublishGate({
      category: fmt.category,
      productType: fmt.productType,
      volumeMl: fmt.volumeMl,
      name,
      sumupName: sumupLabel,
      sumupProductId: p.sumupProductId,
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
    });
    const canPublish =
      fmt.publishOnline && Boolean(fmt.productType) && gate.canPublishOnline;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name,
        sumupName: sumupLabel,
        description,
        barcode: en13.barcode || p.barcode,
        brand: "Vape 47",
        range: rangeDef.name,
        productFamily: rangeDef.family,
        category: fmt.category,
        productType: fmt.productType,
        volumeMl: fmt.volumeMl,
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        rangeId: range.id,
        isActive: true,
        visibleOnline: canPublish,
        catalogStatus: canPublish ? "valide" : "a_verifier",
        importAnomaly: canPublish
          ? null
          : gate.anomalies.join("|") || `incomplet:${fmt.productType || "format"}`,
        promotion10mlEligible: false,
        sumupLastSync: new Date(),
      },
    });

    const row = {
      id: p.id,
      name,
      slug: p.slug,
      range: rangeDef.slug,
      productType: fmt.productType,
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
    fabricant: "Vape 47",
    slug: "vape-47",
    gammes: RANGES.map((r) => r.name),
    publishedCount: published.length,
    linkedOfflineCount: linkedOffline.length,
    skippedCount: skipped.length,
    quarantinedCount: quarantined.length,
    byRange,
    published,
    linkedOffline,
    skipped: skipped.slice(0, 40),
    quarantined,
    controlUrls: [
      "http://localhost:3000/e-liquides",
      "http://localhost:3000/fabricants/vape-47",
      "http://localhost:3000/gammes/enfer?fabricant=vape-47",
      "http://localhost:3000/gammes/les-fruits-d-enfer?fabricant=vape-47",
      "http://localhost:3000/gammes/linvapable?fabricant=vape-47",
      "http://localhost:3000/gammes/furiosa-eggz?fabricant=vape-47",
      "http://localhost:3000/gammes/furiosa-skinz?fabricant=vape-47",
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    REPORT_MD,
    [
      `# Rapport intégration Vape 47 — ${report.date}`,
      "",
      `- Publiés : **${report.publishedCount}**`,
      `- Hors ligne / incomplets : **${report.linkedOfflineCount}**`,
      `- Ignorés : **${report.skippedCount}**`,
      `- Quarantaine : **${report.quarantinedCount}**`,
      "",
      "## Par gamme",
      ...Object.entries(byRange).map(([k, v]) => `- ${k} : ${v}`),
      "",
      "## URLs",
      ...report.controlUrls.map((u) => `- ${u}`),
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        publishedCount: report.publishedCount,
        linkedOfflineCount: report.linkedOfflineCount,
        quarantinedCount: report.quarantinedCount,
        byRange,
        report: REPORT_MD,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
