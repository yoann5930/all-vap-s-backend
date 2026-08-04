import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { uploadInventoryPhotoToDrive } from "@/lib/google/drive";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { storeInventoryPhoto } from "@/lib/inventory/photo-storage";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:photo:${ip}`, 60, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de photos", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({ where: { id } });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Session clôturée" }, 400);
    }

    const form = await request.formData();
    const file = form.get("file");
    const lineId = String(form.get("lineId") || "");
    if (!(file instanceof File)) {
      return jsonResponse({ error: "Photo requise" }, 400);
    }
    if (file.size > 8 * 1024 * 1024) {
      return jsonResponse({ error: "Photo trop lourde (max 8 Mo)" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const filename = `${id}-${Date.now()}.${ext || "jpg"}`;
    const stored = await storeInventoryPhoto({
      sessionId: id,
      filename,
      buffer,
      mimeType: file.type || "image/jpeg",
    });

    const drive = await uploadInventoryPhotoToDrive({
      filename,
      mimeType: file.type || "image/jpeg",
      buffer,
      sessionId: id,
    });

    let updatedLine = null;
    if (lineId) {
      updatedLine = await prisma.inventoryLine.update({
        where: { id: lineId },
        data: {
          photoPath: stored.photoPath,
          driveFileId: drive.ok ? drive.fileId : null,
        },
      });
    }

    return jsonResponse({
      photoPath: stored.photoPath,
      storage: stored.storage,
      drive: drive.ok
        ? { uploaded: true, fileId: drive.fileId }
        : { uploaded: false, code: drive.code, message: drive.message },
      line: updatedLine,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
