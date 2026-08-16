import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/jwt";
import {
  deleteOwnedDevice,
  exportClientMemory,
  getClientAvaMemory,
  purgeAssistanceMemory,
  setConversationalMemory,
  upsertOwnedDevice,
} from "@/lib/ava/client-memory";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth?.userId) return jsonResponse({ error: "Connexion requise" }, 401);
    if (req.nextUrl.searchParams.get("export") === "1") {
      const data = await exportClientMemory(auth.userId);
      return jsonResponse(data);
    }
    const data = await getClientAvaMemory(auth.userId);
    return jsonResponse(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth?.userId) return jsonResponse({ error: "Connexion requise" }, 401);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "set_conversational") {
      const enabled = Boolean(body.enabled);
      return jsonResponse(await setConversationalMemory(auth.userId, enabled));
    }
    if (action === "upsert_device") {
      const parsed = z
        .object({
          id: z.string().optional(),
          manufacturer: z.string().min(1).max(120),
          model: z.string().min(1).max(120),
          modelSlug: z.string().optional(),
          productId: z.string().optional(),
          notes: z.string().max(500).optional(),
        })
        .parse(body);
      const res = await upsertOwnedDevice(auth.userId, parsed);
      if (!res.ok) return jsonResponse({ error: res.error }, 400);
      return jsonResponse(res);
    }
    if (action === "delete_device") {
      const id = z.string().parse(body.id);
      return jsonResponse(await deleteOwnedDevice(auth.userId, id));
    }
    if (action === "purge_assistance") {
      return jsonResponse(await purgeAssistanceMemory(auth.userId));
    }
    return jsonResponse({ error: "Action inconnue" }, 400);
  } catch (e) {
    return handleApiError(e);
  }
}
