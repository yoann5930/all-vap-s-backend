import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { handleApiError } from "@/lib/api-utils";
import {
  assertStoreAllowed,
  requireInventoryAuth,
} from "@/lib/inventory/auth";
import { readInventoryPhotoBuffer } from "@/lib/inventory/photo-storage";
import path from "node:path";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Sert les photos inventaire — authentification inventaire obligatoire (P0#4).
 * Ne jamais exposer sans session employé/admin autorisé pour la boutique.
 */
export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireInventoryAuth();
    const { path: parts } = await context.params;
    if (!parts?.length || parts.length < 2) {
      return new Response("Not found", { status: 404 });
    }

    const sessionId = path.basename(parts[0]!);
    const filename = path.basename(parts.slice(1).join("/"));
    if (!sessionId || !filename || filename.includes("..")) {
      return new Response("Not found", { status: 404 });
    }

    const session = await prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { location: true },
    });
    if (!session) {
      return new Response("Not found", { status: 404 });
    }

    assertStoreAllowed(user, session.location.code);
    if (
      user.role !== "ADMIN" &&
      session.createdByUserId &&
      session.createdByUserId !== user.userId
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const buf = await readInventoryPhotoBuffer(sessionId, filename);
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
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Auth errors → 401/403 via handleApiError JSON ; pour <img> on renvoie status brut
    const msg = error instanceof Error ? error.message : "";
    if (
      msg === "UNAUTHORIZED" ||
      msg === "ACCOUNT_DISABLED" ||
      msg === "MUST_CHANGE_PASSWORD"
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (msg === "FORBIDDEN" || msg === "STORE_NOT_ALLOWED") {
      return new Response("Forbidden", { status: 403 });
    }
    // Fallback JSON pour erreurs inattendues
    return handleApiError(error);
  }
}
