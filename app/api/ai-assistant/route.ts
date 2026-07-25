import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { initHolographicAssistant } from "@/lib/ai/holographic-advisor";
import {
  chatAvaWithVoice,
  isOpenAIConfigured,
  synthesizeGreetingVoice,
} from "@/lib/ai/openai-voice";
import { chatAva } from "@/lib/ai/ava-advisor";
import { AVA_GREETING_SHORT } from "@/lib/ai/ava-speech-utils";

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

    let greeting = {
      content: AVA_GREETING_SHORT,
      spoken: AVA_GREETING_SHORT,
      audioBase64: null as string | null,
      audioMime: "audio/mpeg",
      voiceProvider: "browser" as string,
    };

    if (openaiEnabled) {
      try {
        greeting = await synthesizeGreetingVoice();
      } catch {
        /* fallback browser */
      }
    }

    return jsonResponse({
      ...init,
      openaiEnabled,
      mode: "voice",
      greeting,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({
  message: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = postSchema.parse(await request.json());
    const userId = await getUserId();

    const reply = isOpenAIConfigured()
      ? await chatAvaWithVoice(userId, body.message)
      : await chatAva(userId, body.message);

    return jsonResponse(reply);
  } catch (error) {
    return handleApiError(error);
  }
}
