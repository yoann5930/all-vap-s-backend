import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { initHolographicAssistant, chatHolographicAssistant } from "@/lib/ai/holographic-advisor";

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
    return jsonResponse(init);
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
    const reply = await chatHolographicAssistant(userId, body.message);
    return jsonResponse(reply);
  } catch (error) {
    return handleApiError(error);
  }
}
