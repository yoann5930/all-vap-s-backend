import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import {
  getClientMemoryDossier,
  refreshClientMemoryFromOrders,
} from "@/lib/ava-memory/service";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/ava-memory?userId=… | ?email=…
 * Dossier mémoire client A.V.A. (staff).
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const url = new URL(request.url);
    let userId = url.searchParams.get("userId");
    const email = url.searchParams.get("email");
    if (!userId && email) {
      const u = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      userId = u?.id || null;
    }
    if (!userId) {
      return jsonResponse({ error: "userId ou email requis" }, 400);
    }
    await refreshClientMemoryFromOrders(userId);
    const dossier = await getClientMemoryDossier(userId);
    return jsonResponse({ ok: true, dossier });
  } catch (error) {
    return handleApiError(error);
  }
}

const refreshSchema = z.object({
  userId: z.string().min(1),
});

/** POST — force le recalcul des préférences. */
export async function POST(request: NextRequest) {
  try {
    await requireStaff();
    const body = refreshSchema.parse(await request.json());
    const memory = await refreshClientMemoryFromOrders(body.userId);
    return jsonResponse({ ok: true, memory });
  } catch (error) {
    return handleApiError(error);
  }
}
