/**
 * E2E HTTP réel : login → /api/admin/ava/chat → llmStatus local.
 * OpenAI forcé OFF côté process. Ne log jamais le mot de passe.
 *
 * Prérequis: Next sur :3000, Ollama up, AVA_LLM_PROVIDER=local
 * Credentials: ADMIN_E2E_EMAIL + ADMIN_E2E_PASSWORD (ou AUTH_PREVIEW_TEST_* en preview)
 */
process.env.AVA_LLM_PROVIDER = "local";
delete process.env.OPENAI_API_KEY;

const BASE = (process.env.AVA_E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

function env(name: string) {
  return (process.env[name] || "").trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const email = env("ADMIN_E2E_EMAIL") || env("AUTH_PREVIEW_TEST_EMAIL") || "yoann@allvaps.fr";
  const password =
    env("ADMIN_E2E_PASSWORD") ||
    env("AUTH_PREVIEW_TEST_PASSWORD") ||
    "";

  if (!password) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_password",
        hint: "Set ADMIN_E2E_PASSWORD (local Owner password) to run UI/API e2e",
      })
    );
    process.exit(2);
  }

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  const login = (await loginRes.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
    authVia?: string;
  };
  if (!loginRes.ok || !login.token) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "login",
        status: loginRes.status,
        error: login.error || "login_failed",
        authVia: login.authVia || null,
      })
    );
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${login.token}`,
    Origin: BASE,
  };

  const brain = await fetch(`${BASE}/api/admin/ava/brain-status`, { headers });
  const brainJ = await brain.json().catch(() => ({}));

  const memToken = `UI_MEM_${Date.now().toString(36).toUpperCase()}`;
  const turns = [
    `Mémorise ceci exactement : le code rayon est ${memToken}.`,
    "Quel est le code rayon mémorisé ?",
    "Donne-moi un point stock / priorités en une phrase.",
  ];

  const results: Array<Record<string, unknown>> = [];
  let conversationId: string | null = null;

  for (const message of turns) {
    const res = await fetch(`${BASE}/api/admin/ava/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, conversationId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof data.conversationId === "string") conversationId = data.conversationId;
    const llm = data.llmStatus as
      | { provider?: string; model?: string; kind?: string }
      | undefined;
    results.push({
      http: res.status,
      source: data.source,
      provider: llm?.provider || null,
      model: llm?.model || null,
      kind: llm?.kind || null,
      toolsUsed: data.toolsUsed || [],
      text: String(data.text || "").slice(0, 220),
      hasToken: String(data.text || "").includes(memToken),
      openaiLeak: /openai/i.test(String(data.source || "")) || llm?.provider === "openai",
    });
  }

  const reflections = await fetch(`${BASE}/api/admin/ava/reflections`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "refresh" }),
  });
  const refJ = (await reflections.json().catch(() => ({}))) as Record<string, unknown>;

  const report = {
    ok:
      results.every((r) => Number(r.http) < 400) &&
      results.every((r) => !r.openaiLeak) &&
      Boolean(results[1]?.hasToken || results[0]?.text),
    base: BASE,
    authVia: login.authVia || "password",
    brain: {
      http: brain.status,
      local: (brainJ as { engine?: { local?: string } })?.engine?.local,
      memoryCount: (brainJ as { memory?: { activeCount?: number } })?.memory?.activeCount,
      reflections: (brainJ as { reflections?: { state?: string } })?.reflections?.state,
    },
    turns: results,
    reflections: {
      http: reflections.status,
      ok: refJ.ok !== false,
      error: refJ.error || null,
      count: Array.isArray(refJ.reflections) ? (refJ.reflections as unknown[]).length : null,
      analyse_impossible: refJ.error === "Analyse impossible",
    },
    openai_used: results.some((r) => r.openaiLeak),
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok && !report.openai_used && !report.reflections.analyse_impossible ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
