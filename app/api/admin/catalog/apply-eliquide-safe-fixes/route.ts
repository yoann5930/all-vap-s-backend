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
import { handleApiError } from "@/lib/api-utils";
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
  const dir = path.join(process.cwd(), "public", "media", "manufacturers", mfrSlug, "ranges");
  const bases = [rangeSlug];
  if (!rangeSlug.endsWith(`-${mfrSlug}`)) bases.push(`${rangeSlug}-${mfrSlug}`);
  return bases.some((base) =>
    ["webp", "jpg", "jpeg", "png"].some((ext) => fs.existsSync(path.join(dir, `${base}.${ext}`)))
  );
}

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

    const ranges = await prisma.productRange.findMany({
      where: {
        isActive: true,
        verificationStatus: "OFFICIAL_CONFIRMED",
        catalogVisible: true,
        manufacturerId: { not: null },
      },
      include: { manufacturer: { select: { slug: true, name: true } } },
    });

    const eligible = ranges.filter(
      (r) => r.manufacturer?.slug && hasRangeCover(r.manufacturer.slug, r.slug)
    );

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        eligibleRanges: eligible.length,
        sample: eligible.slice(0, 10).map((r) => `${r.manufacturer?.slug}/${r.slug}`),
      });
    }

    let published = 0;
    const byMfr: Record<string, number> = {};
    for (const range of eligible) {
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
        const slug = range.manufacturer!.slug;
        byMfr[slug] = (byMfr[slug] || 0) + result.count;
      }
    }

    await prisma.manufacturer.updateMany({
      where: { slug: "cookin-cloud", status: "a_verifier" },
      data: { status: "partiel" },
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      published,
      byMfr,
      eligibleRanges: eligible.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
