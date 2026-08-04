import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export type StoredPhoto = {
  photoPath: string;
  storage: "local" | "tmp" | "blob";
};

function isVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

export async function storeInventoryPhoto(params: {
  sessionId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<StoredPhoto> {
  const blobToken = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();

  if (blobToken) {
    const blob = await put(`inventory/${params.sessionId}/${params.filename}`, params.buffer, {
      access: "public",
      contentType: params.mimeType,
      token: blobToken,
    });
    return { photoPath: blob.url, storage: "blob" };
  }

  if (isVercel()) {
    const dir = path.join("/tmp", "allvaps-inventory");
    await mkdir(dir, { recursive: true });
    const abs = path.join(dir, params.filename);
    await writeFile(abs, params.buffer);
    return {
      photoPath: `/api/inventaire/media/${params.filename}`,
      storage: "tmp",
    };
  }

  const dir = path.join(process.cwd(), "public", "uploads", "inventory");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, params.filename), params.buffer);
  return {
    photoPath: `/uploads/inventory/${params.filename}`,
    storage: "local",
  };
}

export async function readTmpInventoryPhoto(filename: string): Promise<Buffer | null> {
  const safe = path.basename(filename);
  try {
    return await readFile(path.join("/tmp", "allvaps-inventory", safe));
  } catch {
    return null;
  }
}
