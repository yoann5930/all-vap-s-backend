/**
 * Corrige les fabricants clairement contredits par le nom SumUp.
 * Ne touche pas aux cas ambigus.
 */
import prisma from "../lib/prisma";
import { rangeCoverUrl } from "../lib/catalog/range-cover";

type Rule = {
  mfrSlug: string;
  rangeSlug: string | null;
  test: (name: string) => boolean;
};

const RULES: Rule[] = [
  {
    mfrSlug: "liquidarom",
    rangeSlug: "ice-cool-x",
    test: (n) => /ice\s*cool\s*x/i.test(n) && /liquidarom/i.test(n),
  },
  {
    mfrSlug: "liquidarom",
    rangeSlug: "ice-cool",
    test: (n) => /ice\s*cool/i.test(n) && !/ice\s*cool\s*x/i.test(n) && /liquidarom/i.test(n),
  },
  {
    mfrSlug: "liquidarom",
    rangeSlug: "les-collegues",
    test: (n) => /les\s*coll[eè]gues/i.test(n) && /liquidarom/i.test(n),
  },
  {
    mfrSlug: "e-tasty",
    rangeSlug: "one-taste",
    test: (n) => /one\s*taste/i.test(n) || (/e[-\s]?tasty/i.test(n) && /\b10\s*ml\b/i.test(n)),
  },
  {
    mfrSlug: "e-tasty",
    rangeSlug: "bankiz",
    test: (n) => /\bbankiz\b/i.test(n) && /e[-\s]?tasty|etasty/i.test(n),
  },
  {
    mfrSlug: "e-tasty",
    rangeSlug: "inspiration",
    test: (n) => /\binspiration\b/i.test(n) && /e[-\s]?tasty|etasty/i.test(n),
  },
  {
    mfrSlug: "e-tasty",
    rangeSlug: null,
    test: (n) => /e[-\s]?tasty/i.test(n) || /\betasty\b/i.test(n),
  },
  {
    mfrSlug: "biarritz-lab",
    rangeSlug: "le-fruit-defendu",
    test: (n) => /fruit\s*d[eé]fendu/i.test(n),
  },
  {
    mfrSlug: "biarritz-lab",
    rangeSlug: "double-dragon",
    test: (n) => /double\s*dragon/i.test(n),
  },
  {
    mfrSlug: "biarritz-lab",
    rangeSlug: "mamita",
    test: (n) => /\bmamita\b/i.test(n),
  },
  {
    mfrSlug: "swoke",
    rangeSlug: "force-vape-swoke",
    test: (n) => /force\s*vape/i.test(n) && /swoke/i.test(n),
  },
  {
    mfrSlug: "swoke",
    rangeSlug: "bisou-swoke",
    test: (n) => /\bbisou\b/i.test(n) && /swoke/i.test(n),
  },
  {
    mfrSlug: "swoke",
    rangeSlug: null,
    test: (n) => /\bswoke\b/i.test(n),
  },
  {
    mfrSlug: "vape-47",
    rangeSlug: "furiosa-eggz",
    test: (n) => /furiosa/i.test(n) && (/vape\s*47/i.test(n) || /eggz|skinz/i.test(n)),
  },
  {
    mfrSlug: "protect",
    rangeSlug: null,
    test: (n) => /\bprotect\b/i.test(n) && !/protection/i.test(n),
  },
  {
    mfrSlug: "raneki-liquide",
    rangeSlug: "olympe",
    test: (n) => /raneki/i.test(n) && /olympe/i.test(n),
  },
  {
    mfrSlug: "raneki-liquide",
    rangeSlug: "kyoto-storm",
    test: (n) => /raneki/i.test(n) && /kyoto/i.test(n),
  },
  {
    mfrSlug: "raneki-liquide",
    rangeSlug: null,
    test: (n) => /\braneki\b/i.test(n),
  },
  {
    mfrSlug: "vap-air",
    rangeSlug: null,
    test: (n) => /vap\s*air|vap'air|by\s+vap\s*air/i.test(n),
  },
  {
    mfrSlug: "the-fuu",
    rangeSlug: "cloud-empire-the-fuu",
    test: (n) => /cloud\s*empire/i.test(n) || /\bthe\s*fuu\b/i.test(n),
  },
  {
    mfrSlug: "liquideo",
    rangeSlug: null,
    test: (n) => /\bliquideo\b/i.test(n),
  },
];

async function main() {
  const mfrCache = new Map<string, { id: string; name: string }>();
  const rangeCache = new Map<string, { id: string; name: string; brandId: string | null }>();

  async function mfr(slug: string) {
    if (!mfrCache.has(slug)) {
      const row = await prisma.manufacturer.findUnique({ where: { slug } });
      if (!row) return null;
      mfrCache.set(slug, { id: row.id, name: row.name });
    }
    return mfrCache.get(slug)!;
  }
  async function range(mfrSlug: string, rangeSlug: string) {
    const key = `${mfrSlug}/${rangeSlug}`;
    if (!rangeCache.has(key)) {
      const m = await mfr(mfrSlug);
      if (!m) return null;
      const row = await prisma.productRange.findFirst({
        where: { manufacturerId: m.id, slug: rangeSlug },
      });
      if (!row) return null;
      rangeCache.set(key, { id: row.id, name: row.name, brandId: row.brandId });
    }
    return rangeCache.get(key)!;
  }

  const products = await prisma.product.findMany({
    where: { manufacturerId: { not: null } },
    select: {
      id: true,
      name: true,
      manufacturerId: true,
      rangeId: true,
      manufacturer: { select: { slug: true } },
    },
  });

  let fixed = 0;
  const samples: string[] = [];

  for (const p of products) {
    const current = p.manufacturer?.slug;
    if (!current) continue;

    for (const rule of RULES) {
      if (!rule.test(p.name)) continue;
      if (current === rule.mfrSlug) {
        // Maybe only range is wrong
        if (rule.rangeSlug) {
          const r = await range(rule.mfrSlug, rule.rangeSlug);
          if (r && p.rangeId !== r.id && rangeCoverUrl(rule.mfrSlug, rule.rangeSlug)) {
            const m = await mfr(rule.mfrSlug);
            await prisma.product.update({
              where: { id: p.id },
              data: {
                manufacturerId: m!.id,
                brand: m!.name,
                brandId: r.brandId,
                rangeId: r.id,
                range: r.name,
                visibleOnline: true,
                isActive: true,
                catalogStatus: "valide",
              },
            });
            fixed += 1;
            if (samples.length < 30)
              samples.push(`${current}→${rule.mfrSlug}/${rule.rangeSlug}: ${p.name}`);
          }
        }
        break;
      }

      // Wrong manufacturer — certain rename in product proves target
      const m = await mfr(rule.mfrSlug);
      if (!m) break;
      const r = rule.rangeSlug ? await range(rule.mfrSlug, rule.rangeSlug) : null;
      const canPublish = Boolean(
        r && rule.rangeSlug && rangeCoverUrl(rule.mfrSlug, rule.rangeSlug)
      );
      await prisma.product.update({
        where: { id: p.id },
        data: {
          manufacturerId: m.id,
          brand: m.name,
          brandId: r?.brandId ?? undefined,
          rangeId: r?.id ?? null,
          range: r?.name ?? null,
          ...(canPublish
            ? { visibleOnline: true, isActive: true, catalogStatus: "valide" }
            : {}),
        },
      });
      fixed += 1;
      if (samples.length < 30)
        samples.push(
          `${current}→${rule.mfrSlug}/${rule.rangeSlug || "-"}: ${p.name}`
        );
      break;
    }
  }

  // Spot-check remaining contradictions
  const remaining = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "Liquidarom", mode: "insensitive" }, NOT: { manufacturer: { slug: "liquidarom" } } },
        { name: { contains: "e-tasty", mode: "insensitive" }, NOT: { manufacturer: { slug: "e-tasty" } } },
        { name: { contains: "E-Tasty", mode: "insensitive" }, NOT: { manufacturer: { slug: "e-tasty" } } },
        { name: { contains: "biarritz", mode: "insensitive" }, NOT: { manufacturer: { slug: "biarritz-lab" } } },
      ],
    },
    select: { name: true, manufacturer: { select: { slug: true } } },
    take: 40,
  });

  console.log(
    JSON.stringify(
      {
        fixed,
        samples,
        remainingContradictions: remaining.map(
          (p) => `${p.manufacturer?.slug}: ${p.name}`
        ),
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
