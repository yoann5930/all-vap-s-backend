import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { ensureGlobalStockLocation } from "@/lib/catalog/stock";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    await ensureGlobalStockLocation();

    const [locations, runs, unmatchedCount, reviewCount] = await Promise.all([
      prisma.stockLocation.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
      prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
      prisma.productMatch.count({ where: { status: "UNMATCHED" } }),
      prisma.productMatch.count({ where: { status: "REVIEW" } }),
    ]);

    return jsonResponse({
      locations,
      recentSyncRuns: runs,
      unmatchedCount,
      reviewCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
