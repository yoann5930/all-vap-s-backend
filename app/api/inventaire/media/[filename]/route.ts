import { NextRequest } from "next/server";
import { readTmpInventoryPhoto } from "@/lib/inventory/photo-storage";

type Ctx = { params: Promise<{ filename: string }> };

/** Sert les photos inventaire stockées en /tmp (runtime Vercel sans Blob). */
export async function GET(_request: NextRequest, context: Ctx) {
  const { filename } = await context.params;
  const buf = await readTmpInventoryPhoto(filename);
  if (!buf) {
    return new Response("Not found", { status: 404 });
  }
  const lower = filename.toLowerCase();
  const type = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
