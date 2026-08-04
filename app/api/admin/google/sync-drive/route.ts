import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { googleConfigStatus } from "@/lib/google/config";
import { uploadInventoryPhotoToDrive } from "@/lib/google/drive";

/** POST /api/admin/google/sync-drive — upload photo inventaire (multipart). */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    const status = googleConfigStatus();
    return jsonResponse({
      status,
      ready: status.driveConfigured,
      message: status.driveConfigured
        ? "Drive configuré"
        : "GOOGLE_NOT_CONFIGURED — renseigner les variables .env",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
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
  } catch (error) {
    return handleApiError(error);
  }
}
