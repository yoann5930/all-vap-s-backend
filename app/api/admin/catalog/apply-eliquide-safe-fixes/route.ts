/**
 * Applique les corrections e-liquides sûres en prod (publication gammes confirmées).
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

    // SQL brut pour rester robuste si le client Prisma / schéma diverge légèrement
    const ranges = await prisma.$queryRawUnsafe<RangeRow[]>(
      `SELECT r.id, r.slug, r."manufacturerId", m.slug AS "mfrSlug"
       FROM "ProductRange" r
       INNER JOIN "Manufacturer" m ON m.id = r."manufacturerId"
       WHERE r."isActive" = true
         AND r."verificationStatus" = 'OFFICIAL_CONFIRMED'
         AND r."catalogVisible" = true
         AND r."manufacturerId" IS NOT NULL`
    );

    const eligible = ranges.filter((r) => hasRangeCover(r.mfrSlug, r.slug));

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        rangesFound: ranges.length,
        eligibleRanges: eligible.length,
        sample: eligible.slice(0, 15).map((r) => `${r.mfrSlug}/${r.slug}`),
      });
    }

    let published = 0;
    const byMfr: Record<string, number> = {};
    for (const range of eligible) {
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

    return NextResponse.json({
      ok: true,
      dryRun: false,
      published,
      byMfr,
      eligibleRanges: eligible.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", detail: message },
      { status: 500 }
    );
  }
}
