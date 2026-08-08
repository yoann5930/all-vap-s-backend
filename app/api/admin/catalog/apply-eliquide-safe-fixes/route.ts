/**
 * Applique les corrections e-liquides sûres en prod :
 * 1) Confirme les gammes qui ont déjà une cover officielle en assets
 * 2) Publie les produits liés à ces gammes
 * Auth: x-inventory-sync-secret
 * POST { apply?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  apply: z.boolean().optional().default(false),
});

/** Gammes avec cover mais volontairement non publiées (à valider Yoann). */
const EXCLUDE_CONFIRM = new Set([
  "the-fuu/cloud-empire-the-fuu",
]);

function secretOk(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function hasRangeCover(mfrSlug: string, rangeSlug: string): boolean {
  const dir = path.join(
    process.cwd(),
    "public",
    "media",
    "manufacturers",
    mfrSlug,
    "ranges"
  );
  const bases = [rangeSlug];
  if (!rangeSlug.endsWith(`-${mfrSlug}`)) bases.push(`${rangeSlug}-${mfrSlug}`);
  return bases.some((base) =>
    ["webp", "jpg", "jpeg", "png"].some((ext) =>
      fs.existsSync(path.join(dir, `${base}.${ext}`))
    )
  );
}

type RangeRow = {
  id: string;
  slug: string;
  manufacturerId: string;
  mfrSlug: string;
  verificationStatus: string | null;
  catalogVisible: boolean | null;
  legacyStatus: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const expected = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();
    if (!expected || expected.length < 24) {
      return NextResponse.json({ error: "Sync non configuré" }, { status: 503 });
    }
    const provided =
      request.headers.get("x-inventory-sync-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      null;
    if (!secretOk(provided, expected)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const statusCounts = await prisma.$queryRawUnsafe<
      Array<{ s: string; c: number }>
    >(
      `SELECT COALESCE("verificationStatus", '(null)') AS s, COUNT(*)::int AS c
       FROM "ProductRange"
       GROUP BY 1
       ORDER BY 2 DESC`
    );

    const ranges = await prisma.$queryRawUnsafe<RangeRow[]>(
      `SELECT r.id, r.slug, r."manufacturerId", m.slug AS "mfrSlug",
              r."verificationStatus", r."catalogVisible", r.status AS "legacyStatus"
       FROM "ProductRange" r
       INNER JOIN "Manufacturer" m ON m.id = r."manufacturerId"
       WHERE r."isActive" = true
         AND r."manufacturerId" IS NOT NULL`
    );

    const withCover = ranges.filter((r) => hasRangeCover(r.mfrSlug, r.slug));
    const toConfirm = withCover.filter(
      (r) => !EXCLUDE_CONFIRM.has(`${r.mfrSlug}/${r.slug}`)
    );
    const alreadyConfirmed = toConfirm.filter(
      (r) =>
        r.verificationStatus === "OFFICIAL_CONFIRMED" &&
        r.catalogVisible === true
    );
    const needConfirm = toConfirm.filter(
      (r) =>
        !(
          r.verificationStatus === "OFFICIAL_CONFIRMED" &&
          r.catalogVisible === true
        )
    );

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalActiveRanges: ranges.length,
        statusCounts,
        withCover: withCover.length,
        alreadyConfirmed: alreadyConfirmed.length,
        needConfirm: needConfirm.length,
        sampleNeedConfirm: needConfirm
          .slice(0, 20)
          .map((r) => `${r.mfrSlug}/${r.slug}`),
        sampleWithCover: withCover
          .slice(0, 15)
          .map((r) => `${r.mfrSlug}/${r.slug}`),
      });
    }

    let confirmed = 0;
    for (const range of needConfirm) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE "ProductRange"
         SET "verificationStatus" = 'OFFICIAL_CONFIRMED',
             "catalogVisible" = true,
             status = 'verifie',
             "verifiedAt" = NOW()
         WHERE id = $1`,
        range.id
      );
      if (typeof n === "number" ? n > 0 : true) confirmed += 1;
    }

    let published = 0;
    const byMfr: Record<string, number> = {};
    for (const range of toConfirm) {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "Product"
         SET "visibleOnline" = true,
             "isActive" = true,
             "catalogStatus" = 'valide'
         WHERE "rangeId" = $1
           AND "manufacturerId" = $2
           AND (
             "visibleOnline" = false
             OR "isActive" = false
             OR "catalogStatus" NOT IN ('valide', 'actif')
           )`,
        range.id,
        range.manufacturerId
      );
      const count = typeof result === "number" ? result : 0;
      if (count > 0) {
        published += count;
        byMfr[range.mfrSlug] = (byMfr[range.mfrSlug] || 0) + count;
      }
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "Manufacturer"
       SET status = 'partiel'
       WHERE slug = 'cookin-cloud' AND status = 'a_verifier'`
    );

    // Ensure manufacturers with confirmed published products are at least partiel/verifie
    await prisma.$executeRawUnsafe(
      `UPDATE "Manufacturer" m
       SET status = CASE
         WHEN m.status = 'a_verifier' THEN 'partiel'
         ELSE m.status
       END
       WHERE m.id IN (
         SELECT DISTINCT r."manufacturerId"
         FROM "ProductRange" r
         WHERE r."verificationStatus" = 'OFFICIAL_CONFIRMED'
           AND r."catalogVisible" = true
           AND r."isActive" = true
       )`
    );

    return NextResponse.json({
      ok: true,
      dryRun: false,
      confirmed,
      published,
      byMfr,
      eligibleRanges: toConfirm.length,
      statusCountsBefore: statusCounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", detail: message },
      { status: 500 }
    );
  }
}
