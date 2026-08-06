import { google } from "googleapis";
import { Readable } from "node:stream";
import { getDriveAuth } from "@/lib/google/auth";
import { getGoogleDriveFolderId, isDriveConfigured } from "@/lib/google/config";

export type DriveUploadResult =
  | { ok: true; fileId: string; webViewLink?: string | null }
  | { ok: false; code: "GOOGLE_NOT_CONFIGURED" | "UPLOAD_FAILED"; message: string };

/**
 * Upload une photo d'inventaire vers le dossier Drive configuré.
 * No-op propre si credentials absents.
 */
export async function uploadInventoryPhotoToDrive(params: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  sessionId: string;
}): Promise<DriveUploadResult> {
  if (!isDriveConfigured()) {
    console.info("[google/drive] skip — non configuré");
    return {
      ok: false,
      code: "GOOGLE_NOT_CONFIGURED",
      message: "Google Drive non configuré — photo conservée en local uniquement.",
    };
  }

  const authResult = getDriveAuth();
  if (!authResult.ok) {
    return { ok: false, code: authResult.code, message: authResult.message };
  }

  try {
    const drive = google.drive({ version: "v3", auth: authResult.auth });
    const folderId = getGoogleDriveFolderId();
    const res = await drive.files.create({
      requestBody: {
        name: params.filename,
        parents: [folderId],
        description: `Inventaire All Vap's session=${params.sessionId}`,
      },
      media: {
        mimeType: params.mimeType,
        body: Readable.from(params.buffer),
      },
      fields: "id, webViewLink",
    });

    if (!res.data.id) {
      return { ok: false, code: "UPLOAD_FAILED", message: "Drive n'a pas renvoyé d'id fichier." };
    }

    return { ok: true, fileId: res.data.id, webViewLink: res.data.webViewLink };
  } catch (err) {
    console.error("[google/drive] upload failed:", err);
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      message: err instanceof Error ? err.message : "Échec upload Drive",
    };
  }
}
