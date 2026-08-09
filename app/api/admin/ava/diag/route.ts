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
    const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";

    let openaiProbe: {
      ok: boolean;
      httpStatus: number | null;
      errorClass: string | null;
      latencyMs: number | null;
      replyChars: number | null;
    } = {
      ok: false,
      httpStatus: null,
      errorClass: null,
      latencyMs: null,
      replyChars: null,
    };

    if (key.length > 20) {
      const started = Date.now();
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "Reply with exactly: PONG" },
              { role: "user", content: "ping" },
            ],
            max_tokens: 8,
            temperature: 0,
          }),
        });
        const latencyMs = Date.now() - started;
        const raw = await res.text();
        let replyChars: number | null = null;
        let errorClass: string | null = null;
        if (res.ok) {
          try {
            const data = JSON.parse(raw) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            replyChars = (data.choices?.[0]?.message?.content || "").trim().length;
          } catch {
            errorClass = "parse_error";
          }
          openaiProbe = {
            ok: Boolean(replyChars && replyChars > 0),
            httpStatus: res.status,
            errorClass: replyChars ? null : errorClass || "empty_content",
            latencyMs,
            replyChars,
          };
        } else {
          // Classes d'erreur seulement — jamais le body OpenAI (peut contenir des détails sensibles)
          if (res.status === 401 || res.status === 403) errorClass = "auth_rejected";
          else if (res.status === 429) errorClass = "rate_limited";
          else if (res.status >= 500) errorClass = "openai_5xx";
          else errorClass = `http_${res.status}`;
          openaiProbe = {
            ok: false,
            httpStatus: res.status,
            errorClass,
            latencyMs,
            replyChars: null,
          };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        openaiProbe = {
          ok: false,
          httpStatus: null,
          errorClass: /timeout|aborted/i.test(msg)
            ? "network_timeout"
            : /fetch|ENOTFOUND|ECONN|network/i.test(msg)
              ? "network_error"
              : "throw",
          latencyMs: Date.now() - started,
          replyChars: null,
        };
      }
    } else {
      openaiProbe.errorClass = "missing_key";
    }

    return jsonResponse({
      mode: "admin_ava_diag_preview",
      vercelEnv: process.env.VERCEL_ENV || null,
      openaiConfigured: key.length > 20,
      openaiKeyChars: key.length,
      openaiKeyPrefix: key.length > 7 ? `${key.slice(0, 7)}…` : null,
      model,
      openaiProbe,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
