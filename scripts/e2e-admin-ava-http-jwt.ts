/**
 * E2E HTTP local (JWT mint) — timeouts explicites, OpenAI OFF.
 */
process.env.AVA_LLM_PROVIDER = "local";
delete process.env.OPENAI_API_KEY;

import { resolve } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";

function loadEnvFile(file: string) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "OPENAI_API_KEY") continue;
    if (!(k in process.env) || !process.env[k]) process.env[k] = v;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");
process.env.AVA_LLM_PROVIDER = "local";
delete process.env.OPENAI_API_KEY;

const BASE = (process.env.AVA_E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 180_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const prisma = (await import("../lib/prisma")).default;
  const { signToken, COOKIE_NAME } = await import("../lib/jwt");

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: "yoann@allvaps.fr" }, { role: "ADMIN" }], active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    console.log(JSON.stringify({ ok: false, error: "no_admin_user" }));
    process.exit(2);
  }

  const token = await signToken({ userId: user.id, email: user.email, role: user.role });
  // Cookie pour test navigateur (fichier local gitignored)
  writeFileSync(
    resolve(process.cwd(), ".local/ava-e2e-cookie.txt"),
    `${COOKIE_NAME}=${token}`,
    "utf8"
  );

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Origin: BASE,
    Cookie: `${COOKIE_NAME}=${token}`,
  };

  const brain = await fetchJson(`${BASE}/api/admin/ava/brain-status`, {
    headers,
    timeoutMs: 60_000,
  });

  const memToken = `UI_MEM_${Date.now().toString(36).toUpperCase()}`;
  const turnsIn = [
    `Mémorise ceci exactement : le code rayon est ${memToken}.`,
    "Quel est le code rayon mémorisé ?",
    "Donne un point stock/priorités en une phrase.",
  ];
  const turns: Array<Record<string, unknown>> = [];
  let conversationId: string | null = null;

  for (const message of turnsIn) {
    const { status, json } = await fetchJson(`${BASE}/api/admin/ava/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, conversationId }),
      timeoutMs: 240_000,
    });
    if (typeof json.conversationId === "string") conversationId = json.conversationId;
    const llm = json.llmStatus as { provider?: string; model?: string } | undefined;
    turns.push({
      http: status,
      source: json.source,
      provider: llm?.provider || null,
      model: llm?.model || null,
      toolsUsed: json.toolsUsed || [],
      hasToken: String(json.text || "").includes(memToken),
      openaiLeak: /openai/i.test(String(json.source || "")) || llm?.provider === "openai",
      text: String(json.text || "").slice(0, 220),
    });
  }

  const reflections = await fetchJson(`${BASE}/api/admin/ava/reflections`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "refresh" }),
    timeoutMs: 120_000,
  });

  const ps = (await (await fetch("http://127.0.0.1:11434/api/ps")).json()) as {
    models?: Array<{ name?: string; size?: number }>;
  };

  const report = {
    layer: "http_backend_real",
    ok:
      turns.every((t) => Number(t.http) === 200) &&
      !turns.some((t) => t.openaiLeak) &&
      Boolean(turns[1]?.hasToken || turns.some((t) => t.hasToken)),
    userEmail: user.email,
    brainHttp: brain.status,
    brain: brain.json,
    turns,
    reflections: {
      http: reflections.status,
      ok: reflections.json.ok !== false && reflections.json.error !== "Analyse impossible",
      error: reflections.json.error || null,
      count: Array.isArray(reflections.json.reflections)
        ? (reflections.json.reflections as unknown[]).length
        : null,
    },
    modelsLoaded: (ps.models || []).map((m) => m.name),
    openai_used: turns.some((t) => t.openaiLeak),
    cookieFile: ".local/ava-e2e-cookie.txt",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok && report.reflections.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
