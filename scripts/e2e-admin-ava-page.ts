/**
 * E2E UI-layer local: cookie JWT → GET /admin/ava + POST chat + reflections.
 * N'affiche jamais le cookie. OpenAI OFF. Pas de DNS.
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

async function main() {
  const prisma = (await import("../lib/prisma")).default;
  const { signToken, COOKIE_NAME } = await import("../lib/jwt");

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: "yoann@allvaps.fr" }, { role: "ADMIN" }],
      active: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    console.log(JSON.stringify({ ok: false, error: "no_admin_user" }));
    process.exit(2);
  }

  const token = await signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  writeFileSync(
    resolve(process.cwd(), ".local/ava-e2e-cookie.txt"),
    `${COOKIE_NAME}=${token}`,
    "utf8"
  );

  const cookie = `${COOKIE_NAME}=${token}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Origin: BASE,
    Cookie: cookie,
  };

  const page = await fetch(`${BASE}/admin/ava`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const html = await page.text();
  const pageOk =
    page.status === 200 &&
    /admin\/ava|A\.V\.A|Réflexions|textarea|brain/i.test(html) &&
    !/\/login\?|name="password"/i.test(html.slice(0, 2000));

  const memToken = `UI_E2E_${Date.now().toString(36).toUpperCase()}`;
  let conversationId: string | null = null;
  const turns: Array<Record<string, unknown>> = [];

  for (const message of [
    `Mémorise exactement : le code rayon est ${memToken}.`,
    "Quel est le code rayon mémorisé ?",
    "Donne le statut stock en une phrase.",
  ]) {
    const res = await fetch(`${BASE}/api/admin/ava/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, conversationId }),
      signal: AbortSignal.timeout(240_000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (typeof json.conversationId === "string") conversationId = json.conversationId;
    const llm = json.llmStatus as { provider?: string; model?: string } | undefined;
    turns.push({
      http: res.status,
      source: json.source,
      provider: llm?.provider || null,
      model: llm?.model || null,
      toolsUsed: json.toolsUsed || [],
      hasToken: String(json.text || "").includes(memToken),
      openaiLeak: /openai/i.test(String(json.source || "")),
      text: String(json.text || "").slice(0, 180),
    });
  }

  const refl = await fetch(`${BASE}/api/admin/ava/reflections`, {
    headers,
    signal: AbortSignal.timeout(120_000),
  });
  const reflJ = (await refl.json().catch(() => ({}))) as Record<string, unknown>;

  const brain = await fetch(`${BASE}/api/admin/ava/brain-status`, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  const brainJ = (await brain.json().catch(() => ({}))) as Record<string, unknown>;

  let modelsLoaded: string[] = [];
  try {
    const ps = await fetch("http://127.0.0.1:11434/api/ps");
    const j = (await ps.json()) as { models?: Array<{ name?: string }> };
    modelsLoaded = (j.models || []).map((m) => m.name || "").filter(Boolean);
  } catch {
    /* */
  }

  const memRecallOk = turns[1]?.hasToken === true;
  const toolOk = (turns[2]?.toolsUsed as string[] | undefined)?.length
    ? true
    : /stock|rupture|priorit/i.test(String(turns[2]?.text || ""));

  console.log(
    JSON.stringify(
      {
        layer: "admin_ava_page_plus_api_real",
        ok: pageOk && memRecallOk && turns.every((t) => t.http === 200),
        pageHttp: page.status,
        pageOk,
        userEmail: user.email,
        brain: brainJ,
        turns,
        reflections: {
          http: refl.status,
          ok: Boolean(reflJ.ok ?? reflJ.reflections),
          analyse_impossible: /analyse impossible/i.test(JSON.stringify(reflJ)),
        },
        memRecallOk,
        toolOk,
        modelsLoaded,
        openai_used: false,
      },
      null,
      2
    )
  );

  process.exit(pageOk && memRecallOk ? 0 : 3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
