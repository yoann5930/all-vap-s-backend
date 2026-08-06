import { NextRequest } from "next/server";
import { readTmpInventoryPhoto } from "@/lib/inventory/photo-storage";

type Ctx = { params: Promise<{ path: string[] }> };

/** Sert les photos inventaire stockées en /tmp (runtime Vercel sans Blob). */
export async function GET(_request: NextRequest, context: Ctx) {
  const { path: parts } = await context.params;
  if (!parts?.length) return new Response("Not found", { status: 404 });

  const buf =
    parts.length >= 2
      ? await readTmpInventoryPhoto(parts[0], parts.slice(1).join("/"))
      : await readTmpInventoryPhoto(parts[0]);

  if (!buf) {
    return new Response("Not found", { status: 404 });
  }
  const filename = parts[parts.length - 1].toLowerCase();
  const type = filename.endsWith(".png")
    ? "image/png"
    : filename.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
