import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { getAvaSessionFromAuth } from "@/lib/auth/user-context";
import { CLIENT_DEMO_EMAIL } from "@/lib/ava/identity-context";
import {
  clearAdminConversationalMemory,
  deleteAdminMemoryItem,
  getAdminMemorySnapshot,
  loadAdminSessionMemory,
  setAdminMemoryImportance,
  supersedeAdminMemoryItem,
  upsertAdminMemoryItem,
} from "@/lib/ava/admin-memory";

export const dynamic = "force-dynamic";

async function assertAdmin() {
  const user = await requireAuth("ADMIN");
  const email = (user.email || "").trim().toLowerCase();
  if (email === CLIENT_DEMO_EMAIL) {
    return { error: jsonResponse({ error: "Accès refusé" }, 403) };
  }
  const ava = await getAvaSessionFromAuth("ADMIN");
  if (!ava?.adminCapabilities) {
    return { error: jsonResponse({ error: "Session Admin requise" }, 403) };
  }
  return { user };
}

/** Lecture mémoire Admin (faits + session courante) — jamais exposé au client. */
export async function GET(request: NextRequest) {
  try {
    const gate = await assertAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const user = gate.user!;
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    const snapshot = await getAdminMemorySnapshot(user.userId);
    const session = conversationId
      ? await loadAdminSessionMemory(user.userId, conversationId)
      : null;
    return jsonResponse({
      mode: "admin_ava_memory",
      updatedAt: snapshot.updatedAt,
      facts: snapshot.facts,
      supersededCount: snapshot.supersededCount,
      session: session
        ? {
            conversationId: session.conversationId,
            summary: session.summary,
            lastTopic: session.lastTopic,
            lastTools: session.lastTools,
            recentActions: session.recentActions,
            updatedAt: session.updatedAt,
          }
        : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    kind: z.enum([
      "confirmed_fact",
      "temporary_context",
      "pending_decision",
      "user_preference",
      "completed_action",
    ]),
    subject: z.string().min(1).max(120),
    content: z.string().min(1).max(500),
    importance: z.enum(["low", "medium", "high"]).optional(),
    taskStatus: z
      .enum(["todo", "in_progress", "blocked", "paused", "done"])
      .optional(),
    project: z.string().max(120).optional(),
  }),
  z.object({
    action: z.literal("correct"),
    itemId: z.string().min(1),
    content: z.string().min(1).max(500),
  }),
  z.object({
    action: z.literal("importance"),
    itemId: z.string().min(1),
    importance: z.enum(["low", "medium", "high"]),
  }),
  z.object({
    action: z.literal("delete"),
    itemId: z.string().min(1),
  }),
  z.object({
    action: z.literal("clear_session"),
    conversationId: z.string().min(1).optional().nullable(),
  }),
]);

export async function PATCH(request: NextRequest) {
  try {
    const gate = await assertAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const user = gate.user!;
    const body = patchSchema.parse(await request.json());

    if (body.action === "upsert") {
      const item = await upsertAdminMemoryItem(user.userId, {
        kind: body.kind,
        subject: body.subject,
        content: body.content,
        importance: body.importance,
        taskStatus: body.taskStatus,
        project: body.project,
        source: "user",
      });
      return jsonResponse({ ok: true, item });
    }
    if (body.action === "correct") {
      const item = await supersedeAdminMemoryItem(user.userId, body.itemId, {
        content: body.content,
        source: "correction",
      });
      if (!item) return jsonResponse({ error: "Souvenir introuvable" }, 404);
      return jsonResponse({ ok: true, item });
    }
    if (body.action === "importance") {
      const ok = await setAdminMemoryImportance(
        user.userId,
        body.itemId,
        body.importance
      );
      if (!ok) return jsonResponse({ error: "Souvenir introuvable" }, 404);
      return jsonResponse({ ok: true });
    }
    if (body.action === "delete") {
      const ok = await deleteAdminMemoryItem(user.userId, body.itemId);
      if (!ok) return jsonResponse({ error: "Souvenir introuvable" }, 404);
      return jsonResponse({ ok: true });
    }
    if (body.action === "clear_session") {
      await clearAdminConversationalMemory(user.userId, body.conversationId);
      return jsonResponse({ ok: true, cleared: "session" });
    }
    return jsonResponse({ error: "Action inconnue" }, 400);
  } catch (e) {
    return handleApiError(e);
  }
}
