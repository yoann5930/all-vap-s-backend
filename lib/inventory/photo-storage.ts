import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export type StoredPhoto = {
  photoPath: string;
  storageKey: string;
  storage: "local" | "tmp" | "blob";
  persistent: boolean;
};

function isVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Stockage photo inventaire.
 * Priorité : Vercel Blob (persistant) → disque local public/uploads → /tmp (éphémère, dernier recours Vercel sans token).
 */
export async function storeInventoryPhoto(params: {
  sessionId: string;
  lineId?: string | null;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<StoredPhoto> {
  const blobToken = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  const storageKey = `inventory/${params.sessionId}/${params.filename}`;

  if (blobToken) {
    const blob = await put(storageKey, params.buffer, {
      access: "public",
      contentType: params.mimeType,
      token: blobToken,
    });
    return {
      photoPath: blob.url,
      storageKey,
      storage: "blob",
      persistent: true,
    };
  }

  // Hors Vercel : toujours sur disque du projet (persiste entre redémarrages locaux)
  if (!isVercel()) {
    const dir = path.join(process.cwd(), "public", "uploads", "inventory", params.sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, params.filename), params.buffer);
    const publicUrl = `/uploads/inventory/${params.sessionId}/${params.filename}`;
    return {
      photoPath: publicUrl,
      storageKey: publicUrl,
      storage: "local",
      persistent: true,
    };
  }

  // Vercel sans Blob : /tmp (périra au cold start) — à éviter en prod
  console.warn(
    "[inventory-photo] BLOB_READ_WRITE_TOKEN manquant sur Vercel — stockage /tmp éphémère"
  );
  const dir = path.join("/tmp", "allvaps-inventory", params.sessionId);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, params.filename);
  await writeFile(abs, params.buffer);
  const publicUrl = `/api/inventaire/media/${params.sessionId}/${params.filename}`;
  return {
    photoPath: publicUrl,
    storageKey: abs,
    storage: "tmp",
    persistent: false,
  };
}

export async function readTmpInventoryPhoto(
  sessionOrFile: string,
  filename?: string
): Promise<Buffer | null> {
  try {
    if (filename) {
      const safeSession = path.basename(sessionOrFile);
      const safeFile = path.basename(filename);
      return await readFile(path.join("/tmp", "allvaps-inventory", safeSession, safeFile));
    }
    // Compat anciens fichiers plats /tmp/allvaps-inventory/{filename}
    const safe = path.basename(sessionOrFile);
    return await readFile(path.join("/tmp", "allvaps-inventory", safe));
  } catch {
    return null;
  }
}

export async function localPhotoExists(publicUrl: string): Promise<boolean> {
  if (!publicUrl.startsWith("/uploads/inventory/")) return false;
  const rel = publicUrl.replace(/^\//, "");
  try {
    await access(path.join(process.cwd(), "public", rel));
    return true;
  } catch {
    return false;
  }
}
