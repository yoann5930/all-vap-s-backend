import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

export type StoredPhoto = {
  /** URL affichable côté client — toujours via API authentifiée. */
  photoPath: string;
  storageKey: string;
  storage: "local" | "tmp" | "blob";
  persistent: boolean;
};

function isVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

function blobToken(): string {
  return (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

/** Chemin API authentifié (jamais une URL Blob publique). */
export function inventoryMediaApiPath(sessionId: string, filename: string): string {
  const safeSession = path.basename(sessionId);
  const safeFile = path.basename(filename);
  return `/api/inventaire/media/${safeSession}/${safeFile}`;
}

export function inventoryLocalPrivateDir(sessionId: string): string {
  return path.join(
    process.cwd(),
    ".data",
    "inventory-photos",
    path.basename(sessionId)
  );
}

export function inventoryBlobPathname(sessionId: string, filename: string): string {
  return `inventory/${path.basename(sessionId)}/${path.basename(filename)}`;
}

/**
 * Stockage photo inventaire.
 * Priorité : Vercel Blob **privé** → disque local **hors public/** → /tmp (éphémère).
 * `photoPath` pointe toujours vers `/api/inventaire/media/...` (auth requise).
 */
export async function storeInventoryPhoto(params: {
  sessionId: string;
  lineId?: string | null;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<StoredPhoto> {
  const token = blobToken();
  const filename = path.basename(params.filename);
  const sessionId = path.basename(params.sessionId);
  const photoPath = inventoryMediaApiPath(sessionId, filename);
  const pathname = inventoryBlobPathname(sessionId, filename);

  if (token) {
    const blob = await put(pathname, params.buffer, {
      access: "private",
      contentType: params.mimeType,
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return {
      photoPath,
      storageKey: blob.url || pathname,
      storage: "blob",
      persistent: true,
    };
  }

  if (!isVercel()) {
    const dir = inventoryLocalPrivateDir(sessionId);
    await mkdir(dir, { recursive: true });
    const abs = path.join(dir, filename);
    await writeFile(abs, params.buffer);
    return {
      photoPath,
      storageKey: abs,
      storage: "local",
      persistent: true,
    };
  }

  console.warn(
    "[inventory-photo] BLOB_READ_WRITE_TOKEN manquant sur Vercel — stockage /tmp éphémère"
  );
  const dir = path.join("/tmp", "allvaps-inventory", sessionId);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, filename);
  await writeFile(abs, params.buffer);
  return {
    photoPath,
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
      return await readFile(
        path.join("/tmp", "allvaps-inventory", safeSession, safeFile)
      );
    }
    const safe = path.basename(sessionOrFile);
    return await readFile(path.join("/tmp", "allvaps-inventory", safe));
  } catch {
    return null;
  }
}

export async function readLocalPrivateInventoryPhoto(
  sessionId: string,
  filename: string
): Promise<Buffer | null> {
  try {
    const abs = path.join(
      inventoryLocalPrivateDir(sessionId),
      path.basename(filename)
    );
    return await readFile(abs);
  } catch {
    return null;
  }
}

/** Lit une photo inventaire (local privé, tmp, ou Blob privé). */
export async function readInventoryPhotoBuffer(
  sessionId: string,
  filename: string
): Promise<Buffer | null> {
  const safeSession = path.basename(sessionId);
  const safeFile = path.basename(filename);

  const local = await readLocalPrivateInventoryPhoto(safeSession, safeFile);
  if (local) return local;

  const tmp = await readTmpInventoryPhoto(safeSession, safeFile);
  if (tmp) return tmp;

  // Legacy : anciens fichiers encore sous public/uploads (lecture seule, plus d’écriture)
  try {
    const legacy = path.join(
      process.cwd(),
      "public",
      "uploads",
      "inventory",
      safeSession,
      safeFile
    );
    return await readFile(legacy);
  } catch {
    /* continue */
  }

  const token = blobToken();
  if (!token) return null;

  try {
    const pathname = inventoryBlobPathname(safeSession, safeFile);
    const result = await get(pathname, { access: "private", token });
    if (!result?.stream) return null;
    const chunks: Buffer[] = [];
    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function localPhotoExists(publicUrl: string): Promise<boolean> {
  // Anciens chemins publics legacy
  if (publicUrl.startsWith("/uploads/inventory/")) {
    const rel = publicUrl.replace(/^\//, "");
    try {
      await access(path.join(process.cwd(), "public", rel));
      return true;
    } catch {
      return false;
    }
  }
  // Nouveau format API
  const m = publicUrl.match(/^\/api\/inventaire\/media\/([^/]+)\/([^/]+)$/);
  if (!m) return false;
  const buf = await readInventoryPhotoBuffer(m[1]!, m[2]!);
  return Boolean(buf);
}
