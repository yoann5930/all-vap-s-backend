import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAvaTestRequest, isAvaTestSessionId } from "@/lib/ava-test/auth";
import { avaTestLog } from "@/lib/ava-test/log";
import { runAvaTestTurn } from "@/lib/ava-test/runner";
import { deleteTestSession, getTestSession } from "@/lib/ava-test/session-store";
import type { AvaTestResponse } from "@/lib/ava-test/types";

const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 5 * 60 * 1000;

const profileSchema = z
  .object({
    cigarettesPerDay: z.number().int().min(1).max(80).optional(),
    cigaretteType: z.string().max(40).optional(),
    cravingFrequency: z.string().max(40).optional(),
    nicotineMg: z.number().min(0).max(50).optional(),
    yearsVaping: z.number().int().min(0).max(40).optional(),
    currentDeviceName: z.string().max(80).optional(),
  })
  .optional();

const postSchema = z.object({
  sessionId: z.string().min(4).max(80),
  message: z.string().min(1).max(2000),
  profilePreset: z.enum(["BEGINNER", "GUIDED", "EXPERT"]).optional(),
  profile: profileSchema,
  sessionResumeToken: z.string().max(20000).optional(),
});

function errorBody(
  errorCode: Extract<AvaTestResponse, { ok: false }>["errorCode"],
  message: string,
): Extract<AvaTestResponse, { ok: false }> {
  return { ok: false, errorCode, message };
}

export function handleAvaTestAuth(authorization: string | null | undefined): {
  status: number;
  body: AvaTestResponse;
} | null {
  const auth = authorizeAvaTestRequest(authorization);
  if (auth.ok) return null;
  return { status: auth.status, body: errorBody(auth.errorCode, auth.message) };
}

export async function handleAvaTestPost(params: {
  authorization: string | null | undefined;
  ip: string;
  body: unknown;
}): Promise<{ status: number; body: AvaTestResponse; retryAfterSec?: number }> {
  const denied = handleAvaTestAuth(params.authorization);
  if (denied) return denied;

  const rl = checkRateLimit(`ava-test:${params.ip || "unknown"}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    avaTestLog("rate_limited", { result: "rate_limited", ip: "redacted" });
    return {
      status: 429,
      retryAfterSec: rl.retryAfterSec,
      body: errorBody("AVA_TEST_RATE_LIMITED", "Trop de requêtes de test. Réessayez plus tard."),
    };
  }

  const parsed = postSchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      status: 400,
      body: errorBody("AVA_TEST_INVALID_REQUEST", "Requête de test invalide"),
    };
  }
  if (!isAvaTestSessionId(parsed.data.sessionId)) {
    return {
      status: 400,
      body: errorBody(
        "AVA_TEST_INVALID_SESSION",
        "sessionId de test requis (préfixe test-, ava-test- ou demo-)",
      ),
    };
  }

  try {
    const body = await runAvaTestTurn(
      {
        sessionId: parsed.data.sessionId,
        message: parsed.data.message,
        profilePreset: parsed.data.profilePreset,
        profile: parsed.data.profile,
      },
      { resumeToken: parsed.data.sessionResumeToken },
    );
    return { status: 200, body };
  } catch (err) {
    avaTestLog("engine_error", { result: "error", session: parsed.data.sessionId });
    console.error("[AVA_TEST] engine", err);
    return {
      status: 500,
      body: errorBody(
        "AVA_TEST_ENGINE_ERROR",
        "Le moteur AVA a rencontré une erreur pendant le test.",
      ),
    };
  }
}

export function handleAvaTestDeleteSession(params: {
  authorization: string | null | undefined;
  ip: string;
  sessionId: string;
}): { status: number; body: AvaTestResponse | { ok: true; deleted: true; sessionId: string } } {
  const denied = handleAvaTestAuth(params.authorization);
  if (denied) return denied;

  const rl = checkRateLimit(`ava-test:${params.ip || "unknown"}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return {
      status: 429,
      body: errorBody("AVA_TEST_RATE_LIMITED", "Trop de requêtes de test. Réessayez plus tard."),
    };
  }

  if (!isAvaTestSessionId(params.sessionId)) {
    return {
      status: 400,
      body: errorBody("AVA_TEST_INVALID_SESSION", "sessionId de test invalide"),
    };
  }

  const existed = Boolean(getTestSession(params.sessionId));
  const deleted = deleteTestSession(params.sessionId);
  if (!existed && !deleted) {
    return {
      status: 404,
      body: errorBody("AVA_TEST_SESSION_NOT_FOUND", "Session de test introuvable"),
    };
  }
  avaTestLog("session_reset", { session: params.sessionId, result: "deleted" });
  return { status: 200, body: { ok: true, deleted: true, sessionId: params.sessionId } };
}
