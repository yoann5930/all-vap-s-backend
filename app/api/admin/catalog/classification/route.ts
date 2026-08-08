import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { CLASSIFICATION_STATUSES } from "@/lib/catalog/eliquide-range-tokens";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const sp = request.nextUrl.searchParams;
    const status = sp.get("status") || "";
    const manufacturer = sp.get("manufacturer") || "";
    const range = sp.get("range") || "";
    const q = (sp.get("q") || "").trim();
    const take = Math.min(Number(sp.get("take") || 100), 500);
    const skip = Math.max(Number(sp.get("skip") || 0), 0);

    // Ensure columns exist (prod may lag migrations)
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationStatus" TEXT NOT NULL DEFAULT 'UNCLASSIFIED'`
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationSources" TEXT`
      );
    } catch {
      /* ignore */
    }

    const where: Record<string, unknown> = {};
    if (status && CLASSIFICATION_STATUSES.includes(status as never)) {
      where.classificationStatus = status;
    }
    if (manufacturer) {
      where.manufacturer = { slug: manufacturer };
    }
    if (range) {
      where.rangeRef = { slug: range };
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sumupName: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows, statusGroups] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
        skip,
        take,
        select: {
          id: true,
          name: true,
          sumupName: true,
          sku: true,
          barcode: true,
          volumeMl: true,
          category: true,
          classificationStatus: true,
          classificationSources: true,
          manufacturer: { select: { slug: true, name: true } },
          rangeRef: { select: { slug: true, name: true } },
        },
      }),
      prisma.product.groupBy({
        by: ["classificationStatus"],
        _count: { _all: true },
      }),
    ]);

    return jsonResponse({
      total,
      skip,
      take,
      statusCounts: Object.fromEntries(
        statusGroups.map((g) => [g.classificationStatus, g._count._all])
      ),
      items: rows.map((r) => ({
        id: r.id,
        rawName: r.sumupName || r.name,
        displayName: r.name,
        manufacturer: r.manufacturer,
        range: r.rangeRef,
        volumeMl: r.volumeMl,
        sku: r.sku,
        barcode: r.barcode,
        category: r.category,
        status: r.classificationStatus || "UNCLASSIFIED",
        sources: r.classificationSources,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
