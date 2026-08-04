import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { googleConfigStatus } from "@/lib/google/config";
import { syncCatalogToGoogleSheets } from "@/lib/google/sheets";
import { uploadInventoryPhotoToDrive } from "@/lib/google/drive";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    return jsonResponse({ status: googleConfigStatus() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "sheets";

    if (action === "sheets") {
      const result = await syncCatalogToGoogleSheets();
      if (!result.ok) {
        return jsonResponse(result, result.code === "GOOGLE_NOT_CONFIGURED" ? 503 : 500);
      }
      return jsonResponse(result);
    }

    if (action === "drive-ping") {
      // Test configuration without uploading secrets
      const status = googleConfigStatus();
      if (!status.driveConfigured) {
        return jsonResponse(
          { ok: false, code: "GOOGLE_NOT_CONFIGURED", status },
          503
        );
      }
      // Minimal empty buffer upload not performed — just report ready
      return jsonResponse({ ok: true, message: "Drive configuré", status });
    }

    if (action === "drive-upload") {
      const form = await request.formData();
      const file = form.get("file");
      const sessionId = String(form.get("sessionId") || "manual");
      if (!(file instanceof File)) {
        return jsonResponse({ error: "Fichier requis" }, 400);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadInventoryPhotoToDrive({
        filename: file.name || `inventory-${Date.now()}.jpg`,
        mimeType: file.type || "image/jpeg",
        buffer,
        sessionId,
      });
      if (!result.ok) {
        return jsonResponse(result, result.code === "GOOGLE_NOT_CONFIGURED" ? 503 : 500);
      }
      return jsonResponse(result);
    }

    return jsonResponse({ error: "action inconnue (sheets|drive-ping|drive-upload)" }, 400);
  } catch (error) {
    return handleApiError(error);
  }
}
