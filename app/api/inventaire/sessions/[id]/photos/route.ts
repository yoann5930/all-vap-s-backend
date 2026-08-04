import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { uploadInventoryPhotoToDrive } from "@/lib/google/drive";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { storeInventoryPhoto } from "@/lib/inventory/photo-storage";
import { assertStoreAllowed, requireInventoryAuth } from "@/lib/inventory/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:photo:${user.userId}`, 60, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de photos", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Session clôturée" }, 400);
    }
    if (user.role !== "ADMIN" && session.createdByUserId && session.createdByUserId !== user.userId) {
      throw new Error("FORBIDDEN");
    }
    assertStoreAllowed(user, session.location.code);

    const form = await request.formData();
    const file = form.get("file");
    const lineId = String(form.get("lineId") || "").trim();
    if (!(file instanceof File)) {
      return jsonResponse({ error: "Photo requise" }, 400);
    }
    if (!lineId) {
      return jsonResponse(
        { error: "Enregistrez d’abord la ligne (quantité + prix) avant la photo" },
        400
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      return jsonResponse({ error: "Photo trop lourde (max 8 Mo)" }, 400);
    }

    const line = await prisma.inventoryLine.findFirst({
      where: { id: lineId, sessionId: id },
    });
    if (!line) {
      return jsonResponse({ error: "Ligne introuvable pour cette session" }, 404);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const filename = `${lineId}-${Date.now()}.${ext || "jpg"}`;
    const mimeType = file.type || "image/jpeg";
    const stored = await storeInventoryPhoto({
      sessionId: id,
      lineId,
      filename,
      buffer,
      mimeType,
    });

    const drive = await uploadInventoryPhotoToDrive({
      filename,
      mimeType,
      buffer,
      sessionId: id,
    });

    const photo = await prisma.inventoryPhoto.create({
      data: {
        inventoryItemId: lineId,
        storageKey: stored.storageKey,
        publicUrl: stored.photoPath,
        mimeType,
        fileSize: buffer.length,
        createdById: user.userId,
      },
    });

    const updatedLine = await prisma.inventoryLine.update({
      where: { id: lineId },
      data: {
        photoPath: stored.photoPath,
        driveFileId: drive.ok ? drive.fileId : null,
      },
      include: { photos: true, product: true },
    });

    await writeAuditLog({
      user,
      action: "INVENTORY_PHOTO",
      storeCode: session.location.code,
      inventoryId: id,
      sessionId: id,
      ip,
      deviceInfo: request.headers.get("user-agent"),
      metadata: {
        lineId,
        photoId: photo.id,
        storage: stored.storage,
        persistent: stored.persistent,
        publicUrl: stored.photoPath,
      },
    });

    await writeInventoryAudit({
      user,
      inventoryId: id,
      inventoryItemId: lineId,
      action: "PHOTO_ADDED",
      fieldName: "photo",
      oldValue: line.photoPath,
      newValue: stored.photoPath,
    });

    return jsonResponse({
      photo,
      photoPath: stored.photoPath,
      storage: stored.storage,
      persistent: stored.persistent,
      drive: drive.ok
        ? { uploaded: true, fileId: drive.fileId }
        : { uploaded: false, code: drive.code, message: drive.message },
      line: updatedLine,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
