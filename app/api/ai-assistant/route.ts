import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { initHolographicAssistant } from "@/lib/ai/holographic-advisor";
import {
  chatAvaWithVoice,
  isOpenAIConfigured,
} from "@/lib/ai/openai-voice";
import { chatAva } from "@/lib/ai/ava-advisor";
import { toSpokenText } from "@/lib/ai/ava-speech-utils";
import { AVA_SUGGESTIONS } from "@/lib/ai/ava-constants";

async function getUserId(): Promise<string | undefined> {
  try {
    const { getAuthUser } = await import("@/lib/jwt");
    const auth = await getAuthUser();
    return auth?.userId;
  } catch {
    return undefined;
  }
}

export async function GET() {
  try {
    const userId = await getUserId();
    const init = await initHolographicAssistant(userId);
    const openaiEnabled = isOpenAIConfigured();
    const spoken = toSpokenText(init.message);

    return jsonResponse({
      ...init,
      openaiEnabled,
      mode: "voice",
      voiceProvider: "browser",
      greeting: {
        content: init.message,
        spoken,
        audioBase64: null,
        audioMime: null,
        voiceProvider: "browser",
      },
    });
  } catch (error) {
    console.error("[ava] GET init failed", error);
    return handleApiError(error);
  }
}

const conversationContextSchema = z
  .object({
    category: z.string().nullable().optional(),
    flavorFamily: z.string().nullable().optional(),
    flavorTerms: z.array(z.string()).optional().default([]),
    freshness: z.enum(["with", "without", "any"]).nullable().optional(),
    nicotineMg: z.number().nullable().optional(),
    volumeMl: z.number().nullable().optional(),
    manufacturer: z.string().nullable().optional(),
    deviceModel: z.string().nullable().optional(),
    refusedCriteria: z.array(z.string()).optional().default([]),
    lastProposedProductIds: z.array(z.string()).optional().default([]),
    lastProposedNames: z.array(z.string()).optional().default([]),
    lastQuestion: z.string().nullable().optional(),
    preferredStoreId: z.enum(["hautmont", "le-quesnoy"]).nullable().optional(),
    turn: z.number().int().nonnegative().optional().default(0),
  })
  .passthrough()
  .nullable()
  .optional();

const postSchema = z.object({
  message: z.string().min(1).max(2000),
  preferredStoreId: z.enum(["hautmont", "le-quesnoy"]).nullable().optional(),
  conversationContext: conversationContextSchema,
});

const FRIENDLY_ERROR =
  "Je rencontre un petit problème pour afficher les résultats. Je réessaie tout de suite — reformulez si besoin.";

export async function POST(request: NextRequest) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch (err) {
      console.error("[ava] invalid JSON body", err);
      return jsonResponse(
        {
          content: FRIENDLY_ERROR,
          suggestions: AVA_SUGGESTIONS,
          products: [],
          speaking: true,
        },
        200
      );
    }

    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("[ava] invalid payload", parsed.error.flatten());
      // Contexte invalide : on continue sans contexte plutôt que d'échouer
      const message =
        typeof raw === "object" &&
        raw &&
        "message" in raw &&
        typeof (raw as { message: unknown }).message === "string"
          ? (raw as { message: string }).message
          : "";
      if (!message.trim()) {
        return jsonResponse(
          {
            content: FRIENDLY_ERROR,
            suggestions: AVA_SUGGESTIONS,
            products: [],
            speaking: true,
          },
          200
        );
      }
      const userId = await getUserId();
      const reply = isOpenAIConfigured()
        ? await chatAvaWithVoice(userId, message.trim(), { conversationContext: null })
        : await chatAva(userId, message.trim(), { conversationContext: null });
      return jsonResponse(reply);
    }

    const body = parsed.data;
    const userId = await getUserId();
    const opts = {
      preferredStoreId: body.preferredStoreId ?? null,
      conversationContext: (body.conversationContext as
        | import("@/lib/ai/ava").AvaConversationContext
        | null
        | undefined) ?? null,
    };

    try {
      const reply = isOpenAIConfigured()
        ? await chatAvaWithVoice(userId, body.message, opts)
        : await chatAva(userId, body.message, opts);
      return jsonResponse(reply);
    } catch (err) {
      console.error("[ava] chat failed, retry without context", err);
      try {
        const reply = await chatAva(userId, body.message, {
          preferredStoreId: opts.preferredStoreId,
          conversationContext: null,
        });
        return jsonResponse({
          ...reply,
          content: reply.content || FRIENDLY_ERROR,
        });
      } catch (err2) {
        console.error("[ava] chat retry failed", err2);
        return jsonResponse(
          {
            content: FRIENDLY_ERROR,
            suggestions: AVA_SUGGESTIONS,
            products: [],
            speaking: true,
          },
          200
        );
      }
    }
  } catch (error) {
    console.error("[ava] POST unexpected", error);
    return jsonResponse(
      {
        content: FRIENDLY_ERROR,
        suggestions: AVA_SUGGESTIONS,
        products: [],
        speaking: true,
      },
      200
    );
  }
}
