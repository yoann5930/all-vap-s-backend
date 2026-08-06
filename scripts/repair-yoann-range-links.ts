/**
 * Répare les rattachements légitimes trop agressivement détachés.
 * Usage: npx tsx scripts/repair-yoann-range-links.ts --apply
 */
import prisma from "../lib/prisma";
import { normalizeForMatch } from "../lib/catalog/official-verification";

type Rule = {
  rangeSlug: string;
  manufacturerSlug?: string;
  mustIncludeAny: string[];
  mustExcludeAny?: string[];
};

const RULES: Rule[] = [
  {
    rangeSlug: "les-fruits-d-enfer",
    mustIncludeAny: ["d enfer", "fruits d enfer", "cerise d enfer", "peche d enfer", "cassis d enfer", "dragon d enfer", "framboise d enfer"],
  },
  {
    rangeSlug: "enfer",
    mustIncludeAny: ["enfer"],
    mustExcludeAny: ["d enfer", "fruits d enfer", "furiosa"],
  },
  {
    rangeSlug: "mythologie-aromes-secrets",
    mustIncludeAny: [
      "aromes & secrets",
      "arômes & secrets",
      "arathorn",
      "baru",
      "etna",
      "esteli",
      "linzor",
      "maipo",
      "maïpo",
      "milos",
      "mythologie",
    ],
  },
  {
    rangeSlug: "hopper-airmust",
    mustIncludeAny: ["hopper"],
    mustExcludeAny: ["blue hopper"],
  },
  {
    rangeSlug: "blue-hopper-airmust",
    mustIncludeAny: ["blue hopper"],
  },
  {
    rangeSlug: "furiosa-eggz",
    mustIncludeAny: ["furiosa", "eggz"],
  },
  {
    rangeSlug: "big-kawa",
    mustIncludeAny: ["big kawa", "cafe frappe", "café frappé", "cafe noisette", "café noisette", "cafe caramel", "café caramel"],
  },
  {
    rangeSlug: "twenty",
    mustIncludeAny: ["twenty"],
  },
  {
    rangeSlug: "dragonzz-liquideo",
    mustIncludeAny: ["dragonzz", "dragonz", "dragon mangue", "dragon fruits", "dragon myrtille", "dragon pasteque"],
  },
  {
    rangeSlug: "unik-airmust",
    mustIncludeAny: ["unik"],
  },
  {
    rangeSlug: "granita-soft-alfa",
    mustIncludeAny: ["granita"],
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  let linked = 0;

  for (const rule of RULES) {
    const range = await prisma.productRange.findFirst({
      where: { slug: rule.rangeSlug },
      include: { manufacturer: true },
    });
    if (!range) {
      console.log("SKIP missing range", rule.rangeSlug);
      continue;
    }

    const products = await prisma.product.findMany({
      where: {
        OR: [{ sumupProductId: { not: null } }, { visibleOnline: true }, { source: "official_catalog" }],
      },
      select: {
        id: true,
        name: true,
        sumupName: true,
        brand: true,
        rangeId: true,
        manufacturerId: true,
      },
      take: 8000,
    });

    const include = rule.mustIncludeAny.map(normalizeForMatch);
    const exclude = (rule.mustExcludeAny || []).map(normalizeForMatch);

    for (const p of products) {
      if (p.rangeId === range.id) continue;
      const hay = normalizeForMatch([p.sumupName, p.name, p.brand].filter(Boolean).join(" "));
      if (!include.some((t) => hay.includes(t))) continue;
      if (exclude.some((t) => hay.includes(t))) continue;

      console.log(`RELINK ${rule.rangeSlug} ← ${p.sumupName || p.name}`);
      if (apply) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            rangeId: range.id,
            manufacturerId: range.manufacturerId || p.manufacturerId,
          },
        });
      }
      linked++;
    }
  }

  console.log(JSON.stringify({ apply, linked }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
