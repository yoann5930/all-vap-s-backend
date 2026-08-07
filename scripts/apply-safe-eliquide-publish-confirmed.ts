/**
 * 1) Corrige les rattachements certains Liquide Lab (Péché Gourmand / Kuix / GlaGla / Iceberg)
 *    s’ils sont sous un mauvais fabricant.
 * 2) Publie en ligne les produits déjà liés à une gamme OFFICIAL_CONFIRMED + cover.
 *
 * Usage: npx tsx scripts/apply-safe-eliquide-publish-confirmed.ts
 */
import fs from "node:fs";
import path from "node:path";
import { norm } from "../lib/catalog/sumup-eliquide-manufacturers";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import prisma from "../lib/prisma";

const MEDIA = path.join(process.cwd(), "public", "media", "manufacturers");

const LIQUIDE_LAB_HINTS: Array<{ token: string; rangeSlug: string }> = [
  { token: "peche gourmand", rangeSlug: "peche-gourmand" },
  { token: "kuix", rangeSlug: "kuix" },
  { token: "glagla", rangeSlug: "glagla" },
  { token: "iceberg", rangeSlug: "iceberg" },
];

async function fixLiquideLabMislinks() {
  const mfr = await prisma.manufacturer.findUnique({ where: { slug: "liquide-lab" } });
  if (!mfr) return { moved: 0 };
  let moved = 0;
  for (const hint of LIQUIDE_LAB_HINTS) {
    const range = await prisma.productRange.findFirst({
      where: { manufacturerId: mfr.id, slug: hint.rangeSlug },
    });
    if (!range) continue;
    if (!rangeCoverUrl("liquide-lab", hint.rangeSlug)) continue;

    const candidates = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: hint.token, mode: "insensitive" } },
          ...(hint.token === "peche gourmand"
            ? [{ name: { contains: "péché gourmand", mode: "insensitive" as const } }]
            : []),
        ],
      },
      select: { id: true, name: true, manufacturerId: true, rangeId: true },
    });

    for (const p of candidates) {
      if (!norm(p.name).includes(norm(hint.token)) && hint.token !== "peche gourmand") {
        continue;
      }
      if (hint.token === "peche gourmand" && !/p[eé]ch[eé]\s*gourmand/i.test(p.name)) {
        continue;
      }
      if (p.manufacturerId === mfr.id && p.rangeId === range.id) continue;
      // Ne pas écraser une autre gamme confirmée du même fabricant
      if (p.manufacturerId === mfr.id && p.rangeId && p.rangeId !== range.id) continue;

      await prisma.product.update({
        where: { id: p.id },
        data: {
          manufacturerId: mfr.id,
          brandId: range.brandId,
          brand: "Liquide Lab",
          rangeId: range.id,
          range: range.name,
        },
      });
      moved += 1;
    }
  }
  return { moved };
}

async function publishConfirmedRangeProducts() {
  const ranges = await prisma.productRange.findMany({
    where: {
      isActive: true,
      verificationStatus: "OFFICIAL_CONFIRMED",
      catalogVisible: true,
      manufacturerId: { not: null },
    },
    include: { manufacturer: { select: { slug: true, name: true } } },
  });

  let published = 0;
  let skippedNoCover = 0;
  const byMfr = new Map<string, number>();

  for (const range of ranges) {
    const mSlug = range.manufacturer?.slug;
    if (!mSlug) continue;
    if (!rangeCoverUrl(mSlug, range.slug)) {
      skippedNoCover += 1;
      continue;
    }
    // Skip if cover file missing on disk (extra safety)
    const coverPath = path.join(MEDIA, mSlug, "ranges");
    if (!fs.existsSync(coverPath)) {
      skippedNoCover += 1;
      continue;
    }

    const result = await prisma.product.updateMany({
      where: {
        rangeId: range.id,
        manufacturerId: range.manufacturerId!,
        OR: [
          { visibleOnline: false },
          { isActive: false },
          { catalogStatus: { notIn: ["valide", "actif"] } },
        ],
      },
      data: {
        visibleOnline: true,
        isActive: true,
        catalogStatus: "valide",
      },
    });
    if (result.count > 0) {
      published += result.count;
      byMfr.set(mSlug, (byMfr.get(mSlug) || 0) + result.count);
    }
  }

  return {
    published,
    skippedNoCover,
    byMfr: Object.fromEntries([...byMfr.entries()].sort((a, b) => b[1] - a[1])),
  };
}

async function main() {
  const moved = await fixLiquideLabMislinks();
  const pub = await publishConfirmedRangeProducts();
  console.log(JSON.stringify({ liquideLabFixes: moved, publish: pub }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
