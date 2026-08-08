/**
 * Persistance conversations A.V.A. (multi-threads).
 */
import prisma from "@/lib/prisma";
import type { AvaSurface } from "@/lib/ava/identity-context";
import { AvaError, AvaErrorCode } from "@/lib/ava/errors";

export async function listConversations(userId: string, surface: AvaSurface) {
  try {
    return await prisma.avaConversation.findMany({
      where: { ownerUserId: userId, surface, status: "active" },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        status: true,
      },
    });
  } catch (e) {
    // Tables absentes → liste vide (fallback legacy côté route)
    return [];
  }
}

export async function createConversation(params: {
  userId: string;
  surface: AvaSurface;
  title?: string;
}) {
  try {
    return await prisma.avaConversation.create({
      data: {
        ownerUserId: params.userId,
        surface: params.surface,
        title: params.title || "Nouvelle conversation",
        status: "active",
      },
    });
  } catch (e) {
    throw new AvaError(
      AvaErrorCode.AVA_MEMORY_UNAVAILABLE,
      e instanceof Error ? e.message : "Création conversation impossible"
    );
  }
}

export async function getConversationForUser(
  conversationId: string,
  userId: string,
  surface: AvaSurface
) {
  return prisma.avaConversation.findFirst({
    where: { id: conversationId, ownerUserId: userId, surface },
  });
}

export async function loadMessages(conversationId: string, take = 80) {
  return prisma.avaChatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export async function appendMessage(params: {
  conversationId: string;
  role: string;
  content: string;
  status?: string;
  errorCode?: string | null;
  linksJson?: unknown;
  metaJson?: unknown;
}) {
  const msg = await prisma.avaChatMessage.create({
    data: {
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      status: params.status || "ok",
      errorCode: params.errorCode || null,
      linksJson: params.linksJson as object | undefined,
      metaJson: params.metaJson as object | undefined,
    },
  });

  const updates: { updatedAt: Date; title?: string } = {
    updatedAt: new Date(),
  };
  if (params.role === "user") {
    const conv = await prisma.avaConversation.findUnique({
      where: { id: params.conversationId },
    });
    if (conv && (!conv.title || conv.title === "Nouvelle conversation")) {
      updates.title = params.content.slice(0, 60);
    }
  }
  await prisma.avaConversation.update({
    where: { id: params.conversationId },
    data: updates,
  });
  return msg;
}

export async function ensureConversation(params: {
  userId: string;
  surface: AvaSurface;
  conversationId?: string | null;
}) {
  if (params.conversationId) {
    const existing = await getConversationForUser(
      params.conversationId,
      params.userId,
      params.surface
    );
    if (existing) return existing;
  }
  return createConversation({ userId: params.userId, surface: params.surface });
}

/**
 * Fallback LEGACY flat (AvaGestionMessage) si tables multi-conversations absentes.
 */
export async function loadLegacyFlatMessages(userId: string) {
  try {
    const rows = await prisma.avaGestionMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return rows.reverse().map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      linksJson: r.linksJson,
      metaJson: r.metaJson,
      status: "ok",
      errorCode: null as string | null,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

export async function saveLegacyFlatMessage(input: {
  userId: string;
  role: string;
  content: string;
  linksJson?: unknown;
  metaJson?: unknown;
  errorCode?: string | null;
}) {
  try {
    await prisma.avaGestionMessage.create({
      data: {
        userId: input.userId,
        role: input.role,
        content: input.content,
        linksJson: input.linksJson as object | undefined,
        metaJson: {
          ...(input.metaJson as object),
          errorCode: input.errorCode || undefined,
        } as object,
      },
    });
  } catch {
    /* ignore */
  }
}

/** Archive (soft) — ne supprime pas l'historique. */
export async function archiveConversation(
  conversationId: string,
  userId: string,
  surface: AvaSurface
) {
  const existing = await getConversationForUser(conversationId, userId, surface);
  if (!existing) return null;
  return prisma.avaConversation.update({
    where: { id: conversationId },
    data: { status: "archived" },
  });
}
