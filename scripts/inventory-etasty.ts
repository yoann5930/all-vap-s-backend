/**
 * Inventaire e.Tasty depuis la DB SumUp import (aucune invention).
 * Parse gammes uniquement quand le nom les déclare clairement.
 */
import prisma from "../lib/prisma";

function detectFormat(name: string, category: string): string | null {
  const t = `${name} ${category}`.toLowerCase();
  if (/\b100\s*ml\b|09\.e-liquide\s*100/.test(t)) return "100ml";
  if (/\b10\s*ml\b|05\.e-liquide\s*10/.test(t)) return "10ml";
  if (/\b50\s*ml\b|06\.e-liquide\s*50/.test(t)) return "50ml";
  if (/\b30\s*ml\b/.test(t)) return "30ml";
  return null;
}

function detectNicotine(name: string): { mg: number | null; label: string | null } {
  const m = name.match(/\b(\d+)\s*mg\b/i);
  if (m) return { mg: Number(m[1]), label: `${m[1]} mg` };
  if (/\bsel\s*de\s*nicotine\b/i.test(name)) {
    const m2 = name.match(/\b(\d+)\s*mg/i);
    if (m2) return { mg: Number(m2[1]), label: `${m2[1]} mg sel` };
  }
  return { mg: null, label: null };
}

/**
 * Gamme déclarée dans le libellé SumUp — sinon null (à vérifier).
 */
function detectRange(name: string): string | null {
  const n = name;
  if (/bankiz/i.test(n)) return "Bankiz";
  if (/inspiration/i.test(n)) return "Inspiration";
  if (/god\s*fall\s*city|godfallcity/i.test(n)) return "God Fall City";
  if (/smoke\s*wars/i.test(n)) return "Smoke Wars";
  if (/gang\s*organis/i.test(n)) return "Gang Organisé";
  if (/one\s*taste/i.test(n)) return "One Taste";
  if (/fruit\s*du\s*dragon|fruits?\s*rouges|menthe|ananas|barbe|bonbon|caf[eé]|caramel|cassis|cerise|citron/i.test(n) && /10\s*ml/i.test(n) && /e-?tasty/i.test(n)) {
    // 10ml classiques souvent One Taste / classiques — sans preuve gamme → null
    return null;
  }
  if (/\bbase\b/i.test(n) && /diy|pg|vg/i.test(n)) return null; // DIY hors e-liquides gamme
  return null;
}

function isETasty(name: string): boolean {
  return /e[-\s]?tasty|etasty/i.test(name);
}

function isDiyBase(name: string, category: string): boolean {
  return /\bbase\b/i.test(name) || /18\.d\.?i\.?y/i.test(category);
}

async function main() {
  const all = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "e-tasty", mode: "insensitive" } },
        { name: { contains: "E-Tasty", mode: "insensitive" } },
        { name: { contains: "E Tasty", mode: "insensitive" } },
        { name: { contains: "ETasty", mode: "insensitive" } },
        { name: { contains: "etasty", mode: "insensitive" } },
        { sumupName: { contains: "tasty", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      category: true,
      priceCents: true,
      stock: true,
      barcode: true,
      sumupProductId: true,
      sumupVariantId: true,
      imageUrl: true,
      imageStatus: true,
      catalogStatus: true,
      visibleOnline: true,
      sumupName: true,
    },
    orderBy: { name: "asc" },
  });

  const filtered = all.filter((p) => isETasty(p.name) || isETasty(p.sumupName || ""));

  const byRange = new Map<string, typeof filtered>();
  const noRange: typeof filtered = [];
  const diy: typeof filtered = [];

  for (const p of filtered) {
    if (isDiyBase(p.name, p.category)) {
      diy.push(p);
      continue;
    }
    const range = detectRange(p.name);
    if (!range) {
      noRange.push(p);
      continue;
    }
    const list = byRange.get(range) || [];
    list.push(p);
    byRange.set(range, list);
  }

  const summary = {
    total: filtered.length,
    diy: diy.length,
    sansGammeClaire: noRange.length,
    gammes: [...byRange.entries()].map(([g, items]) => ({
      gamme: g,
      count: items.length,
      formats: [...new Set(items.map((i) => detectFormat(i.name, i.category)).filter(Boolean))],
      sample: items.slice(0, 5).map((i) => i.name),
    })),
    sansGammeSample: noRange.slice(0, 15).map((p) => p.name),
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
