import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { isPreviewAuthTestEnvironment } from "@/lib/auth/preview-test-login";
import {
  createOpenAIChatCompletion,
  fingerprintOpenAIKey,
  getOpenAIApiKey,
  getOpenAIModel,
} from "@/lib/ai/openai-chat";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Diagnostic Preview uniquement — aucun secret exposé. */
export async function GET() {
  try {
    const host = (await headers()).get("host");
    if (!isPreviewAuthTestEnvironment({ host })) {
      return jsonResponse({ error: "Preview only" }, 404);
    }
    await requireAuth("ADMIN");

    const key = getOpenAIApiKey();
    const model = getOpenAIModel();
    const orgIdSet = Boolean((process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || "").trim());
    const projectIdSet = Boolean((process.env.OPENAI_PROJECT_ID || "").trim());

    // Un seul appel minimal — pas de boucle. maxAttempts=1 pour diag.
    const probe = await createOpenAIChatCompletion({
      messages: [
        { role: "system", content: "Reply with exactly: PONG" },
        { role: "user", content: "ping" },
      ],
      maxTokens: 8,
      temperature: 0,
      maxAttempts: 1,
      logTag: "ava-admin-diag",
    });

    return jsonResponse({
      mode: "admin_ava_diag_preview",
      vercelEnv: process.env.VERCEL_ENV || null,
      openaiConfigured: key.length > 20,
      openaiKeyChars: key.length,
      openaiKeyFingerprint: fingerprintOpenAIKey(key),
      model,
      orgIdConfigured: orgIdSet,
      projectIdConfigured: projectIdSet,
      openaiProbe: {
        ok: probe.ok,
        httpStatus: probe.httpStatus,
        kind: probe.kind,
        apiType: probe.apiType,
        apiCode: probe.apiCode,
        apiMessage: probe.apiMessage,
        retryAfterSec: probe.retryAfterSec,
        attempts: probe.attempts,
        latencyMs: probe.latencyMs,
        replyChars: probe.text?.length ?? null,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
