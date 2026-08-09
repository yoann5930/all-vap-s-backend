import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { isPreviewAuthTestEnvironment } from "@/lib/auth/preview-test-login";
import {
  fingerprintOpenAIKey,
  getOpenAIApiKey,
  getOpenAIModel,
} from "@/lib/ai/openai-chat";
import {
  chatWithAvaLlm,
  probeAvaLlmProviders,
  resolveAvaLlmProviderMode,
} from "@/lib/ai/providers";
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
    const providers = await probeAvaLlmProviders();
    const mode = resolveAvaLlmProviderMode();

    // Un seul ping minimal via le routeur (pas de boucle providers)
    const probe = await chatWithAvaLlm({
      messages: [
        { role: "system", content: "Reply with exactly: PONG" },
        { role: "user", content: "ping" },
      ],
      maxTokens: 8,
      temperature: 0,
      preferShort: true,
      logTag: "ava-admin-diag",
    });

    return jsonResponse({
      mode: "admin_ava_diag_preview",
      vercelEnv: process.env.VERCEL_ENV || null,
      llmProviderMode: mode,
      providers,
      openaiConfigured: key.length > 20,
      openaiKeyChars: key.length,
      openaiKeyFingerprint: fingerprintOpenAIKey(key),
      openaiModel: getOpenAIModel(),
      llmProbe: {
        ok: probe.ok,
        provider: probe.provider,
        model: probe.model,
        kind: probe.kind,
        httpStatus: probe.httpStatus,
        apiCode: probe.apiCode,
        apiMessage: probe.apiMessage,
        attempts: probe.attempts,
        latencyMs: probe.latencyMs,
        tried: probe.tried,
        replyChars: probe.text?.length ?? null,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
