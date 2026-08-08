import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import {
  CLIENT_DEMO_EMAIL,
  resolveAvaSessionContext,
} from "@/lib/ava/identity-context";
import { AvaError, AvaErrorCode } from "@/lib/ava/errors";
import {
  archiveConversation,
  createConversation,
  listConversations,
} from "@/lib/ava/conversation-store";

export const dynamic = "force-dynamic";

async function gate(user: { userId: string; email: string; role: string }) {
  if ((user.email || "").trim().toLowerCase() === CLIENT_DEMO_EMAIL) {
    throw new AvaError(
      AvaErrorCode.AVA_PERMISSION_DENIED,
      "CLIENT blocked",
      "Accès refusé"
    );
  }
  const ctx = await resolveAvaSessionContext({
    userId: user.userId,
    email: user.email,
    sessionRole: user.role,
    surface: "admin",
  });
  if (!ctx.adminCapabilities) {
    throw new AvaError(AvaErrorCode.AVA_AUTH_FAILED, "no admin", "Session Admin requise");
  }
  return ctx;
}

export async function GET() {
  try {
    const user = await requireAuth("ADMIN");
    await gate(user);
    const conversations = await listConversations(user.userId, "admin");
    return jsonResponse({ conversations });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse({ error: error.publicMessage, errorCode: error.code }, 403);
    }
    return handleApiError(error);
  }
}

const postSchema = z.object({
  title: z.string().max(80).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    await gate(user);
    const body = postSchema.parse(await request.json().catch(() => ({})));
    const conversation = await createConversation({
      userId: user.userId,
      surface: "admin",
      title: body.title,
    });
    return jsonResponse({ conversation });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse({ error: error.publicMessage, errorCode: error.code }, 403);
    }
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(["archive"]),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    await gate(user);
    const body = patchSchema.parse(await request.json());
    if (body.action === "archive") {
      const conv = await archiveConversation(body.conversationId, user.userId, "admin");
      return jsonResponse({ conversation: conv });
    }
    return jsonResponse({ error: "action inconnue" }, 400);
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse({ error: error.publicMessage, errorCode: error.code }, 403);
    }
    return handleApiError(error);
  }
}
