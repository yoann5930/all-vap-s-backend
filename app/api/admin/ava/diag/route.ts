import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { isPreviewAuthTestEnvironment } from "@/lib/auth/preview-test-login";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Diagnostic Preview uniquement — aucun secret exposé. */
export async function GET(request: Request) {
  try {
    const host = (await headers()).get("host");
    if (!isPreviewAuthTestEnvironment({ host })) {
      return jsonResponse({ error: "Preview only" }, 404);
    }
    await requireAuth("ADMIN");
    const key = (process.env.OPENAI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
    return jsonResponse({
      mode: "admin_ava_diag_preview",
      vercelEnv: process.env.VERCEL_ENV || null,
      openaiConfigured: key.length > 20,
      openaiKeyChars: key.length,
      model: (process.env.OPENAI_MODEL || "gpt-4o-mini").trim(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
