/**
 * Inventaire strict des e-liquides e.Tasty 10 ml (DB SumUp + état actuel).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function isETasty(name: string): boolean {
  return /e[-\s]?tasty|etasty/i.test(name);
}

function detectFormat(name: string, category: string): string | null {
  const t = `${name} ${category}`.toLowerCase();
  if (/\b100\s*ml\b|09\.e-liquide\s*100/.test(t)) return "100ml";
  if (/\b10\s*ml\b|05\.e-liquide\s*10/.test(t)) return "10ml";
  if (/\b50\s*ml\b|06\.e-liquide\s*50/.test(t)) return "50ml";
  if (/\b30\s*ml\b/.test(t)) return "30ml";
  return null;
}

function detectNicotine(name: string): number | null {
  const m = name.match(/\b(\d+)\s*mg\b/i);
  return m ? Number(m[1]) : null;
}

function detectExplicitRange(name: string): string | null {
  if (/bankiz/i.test(name)) return "Bankiz";
  if (/inspiration/i.test(name)) return "Inspiration";
  if (/god\s*fall|godfall/i.test(name)) return "God Fall City";
  if (/smoke\s*wars|smokewars/i.test(name)) return "Smoke Wars";
  if (/gang\s*organis/i.test(name)) return "Gang Organisé";
  if (/one\s*taste/i.test(name)) return "One Taste";
  if (/freezy\s*crush/i.test(name)) return "Freezy Crush";
  if (/numbers/i.test(name)) return "Numbers";
  if (/letters/i.test(name)) return "Letters";
  return null;
}

function flavorBase(name: string): string {
  return name
    .replace(/e[-\s]?tasty|etasty/gi, " ")
    .replace(/one\s*taste|bankiz|inspiration|smoke\s*wars|gang\s*organis[eé]*|freezy\s*crush/gi, " ")
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/[-_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function main() {
  const all = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "tasty", mode: "insensitive" } },
        { sumupName: { contains: "tasty", mode: "insensitive" } },
        { brand: "e.Tasty" },
        { manufacturer: { slug: "e-tasty" } },
      ],
    },
    include: {
      variants: true,
      rangeRef: true,
      manufacturer: true,
    },
    orderBy: { name: "asc" },
  });

  const etasty = all.filter((p) => isETasty(p.name) || isETasty(p.sumupName || "") || p.brand === "e.Tasty");
  const tenMl = etasty.filter((p) => detectFormat(p.name, p.category) === "10ml" || p.productType === "10ml");

  // Group by flavor base (nicotine variants)
  const groups = new Map<string, typeof tenMl>();
  for (const p of tenMl) {
    const key = `${detectExplicitRange(p.name) || p.range || p.productFamily || "NO_RANGE"}::${flavorBase(p.name)}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  const published = tenMl.filter((p) => p.visibleOnline);
  const aVerifier = tenMl.filter((p) => !p.visibleOnline);

  const report = {
    date: new Date().toISOString(),
    totalETasty: etasty.length,
    total10ml: tenMl.length,
    published10ml: published.length,
    aVerifier10ml: aVerifier.length,
    withOfficialPhoto10ml: tenMl.filter(
      (p) => p.imageStatus === "official" && p.imageUrl?.includes("/e-tasty/") && p.imageUrl.includes("/10ml/")
    ).length,
    wronglyPhoto50or100: tenMl.filter(
      (p) =>
        p.imageUrl &&
        (/\/50ml\//.test(p.imageUrl) || /\/100ml\//.test(p.imageUrl))
    ).map((p) => ({ name: p.name, imageUrl: p.imageUrl })),
    byFamily: {} as Record<string, number>,
    byExplicitRange: {} as Record<string, number>,
    flavorGroups: [...groups.entries()].map(([k, items]) => ({
      key: k,
      count: items.length,
      nicotines: items.map((i) => detectNicotine(i.name)).sort((a, b) => (a || 0) - (b || 0)),
      published: items.filter((i) => i.visibleOnline).length,
      sample: items[0]?.name,
      imageUrl: items[0]?.imageUrl,
      imageStatus: items[0]?.imageStatus,
      catalogStatus: items[0]?.catalogStatus,
      importAnomaly: items[0]?.importAnomaly,
    })),
    sampleAVerifier: aVerifier.slice(0, 40).map((p) => ({
      name: p.name,
      family: p.productFamily,
      range: p.range,
      anomaly: p.importAnomaly,
      imageUrl: p.imageUrl,
      imageStatus: p.imageStatus,
      priceCents: p.priceCents,
      sumupProductId: p.sumupProductId,
      barcode: p.barcode,
      variants: p.variants.length,
    })),
  };

  for (const p of tenMl) {
    const f = p.productFamily || "null";
    report.byFamily[f] = (report.byFamily[f] || 0) + 1;
    const r = detectExplicitRange(p.name) || "sans_libelle_gamme";
    report.byExplicitRange[r] = (report.byExplicitRange[r] || 0) + 1;
  }

  const out = path.resolve("data/rebuild/ETASTY_10ML_INVENTORY.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        out,
        total10ml: report.total10ml,
        published10ml: report.published10ml,
        aVerifier10ml: report.aVerifier10ml,
        withOfficialPhoto10ml: report.withOfficialPhoto10ml,
        wrongPhotos: report.wronglyPhoto50or100.length,
        byExplicitRange: report.byExplicitRange,
        byFamily: report.byFamily,
        flavorGroups: report.flavorGroups.length,
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
