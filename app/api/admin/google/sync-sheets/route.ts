import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { syncCatalogToGoogleSheets } from "@/lib/google/sheets";
import { googleConfigStatus } from "@/lib/google/config";

/** POST /api/admin/google/sync-sheets — sync catalogue/stocks/historique. */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    return jsonResponse({ status: googleConfigStatus() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const result = await syncCatalogToGoogleSheets();
    if (!result.ok) {
      return jsonResponse(result, result.code === "GOOGLE_NOT_CONFIGURED" ? 503 : 500);
    }
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
