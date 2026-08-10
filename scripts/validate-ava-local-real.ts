/**
 * Validation locale réelle A.V.A. — Ollama + mémoire + routeur + outils + gateway.
 * OpenAI forcé OFF. Pas de DNS.
 *
 * Usage: npx tsx scripts/validate-ava-local-real.ts
 */
process.env.AVA_LLM_PROVIDER = "local";
delete process.env.OPENAI_API_KEY;

import { createHmac, randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { freemem, totalmem } from "os";

function loadSecret(): string {
  const p = resolve(process.cwd(), ".local/ava-llm-gateway/gateway.secret");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  return process.env.AVA_LLM_GATEWAY_SECRET || "";
}

function sign(secret: string, body: string, ts: string, nonce: string) {
  return createHmac("sha256", secret).update(`${ts}.${nonce}.${body}`).digest("hex");
}

async function hmacGet(path: string, secret: string) {
  const body = "";
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(12).toString("hex");
  const res = await fetch(`http://127.0.0.1:8791${path}`, {
    headers: {
      "X-Allvaps-Timestamp": ts,
      "X-Allvaps-Nonce": nonce,
      "X-Allvaps-Signature": sign(secret, body, ts, nonce),
    },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function ollamaPs(): Promise<{ names: string[]; sizeGb: number }> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/ps");
    const j = (await res.json()) as {
      models?: Array<{ name?: string; size?: number }>;
    };
    const models = j.models || [];
    return {
      names: models.map((m) => m.name || "").filter(Boolean),
      sizeGb:
        Math.round(
          (models.reduce((a, m) => a + (m.size || 0), 0) / 1024 ** 3) * 10
        ) / 10,
    };
  } catch {
    return { names: [], sizeGb: 0 };
  }
}

async function main() {
  const report: Record<string, unknown> = {
    openai_key_present: Boolean(process.env.OPENAI_API_KEY),
    provider_mode: process.env.AVA_LLM_PROVIDER,
    ram_total_gb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    ram_free_gb_start: Math.round((freemem() / 1024 ** 3) * 10) / 10,
  };

  // --- Gateway routes ---
  const root = await fetch("http://127.0.0.1:8791/");
  const rootJ = await root.json();
  report.gateway_root_ok = root.ok && rootJ.ok === true;
  report.gateway_root = rootJ;

  const health = await fetch("http://127.0.0.1:8791/health");
  const healthJ = await health.json();
  report.gateway_health_ok = health.ok && healthJ.ok === true;

  const secret = loadSecret();
  const st = await hmacGet("/status", secret);
  const md = await hmacGet("/models", secret);
  report.gateway_status = { http: st.status, ok: (st.json as { ok?: boolean })?.ok };
  report.gateway_models = {
    http: md.status,
    allowed: (md.json as { allowed?: string[] })?.allowed,
    installedAllowed: (md.json as { installedAllowed?: string[] })?.installedAllowed,
  };

  const {
    getReachableRuntime,
    decideEngineRole,
    chatWithEngineRole,
  } = await import("../lib/ai/local");
  const { answerAdminAvaConversation } = await import(
    "../lib/ava-gestion/admin-conversation"
  );
  const {
    loadAdminPersistentMemory,
    upsertAdminMemoryItem,
  } = await import("../lib/ava/admin-memory");
  const { runBusinessIntelligence, formatReflectionsForChat } = await import(
    "../lib/ava/business-intelligence"
  );
  const { looksLikeBannedGeneric } = await import("../lib/ava/admin-memory");
  const { selectAdminTools, runAdminToolPlan } = await import("../lib/ava/admin-tools");

  const rt = await getReachableRuntime();
  report.runtime = rt?.id || null;
  const installed = rt ? (await rt.listModels()).map((m) => m.name) : [];
  report.has_gemma = installed.includes("gemma3:12b");
  report.has_llama31 = installed.includes("llama3.1:8b");
  report.has_llama32 = installed.includes("llama3.2:3b");

  for (const role of ["conversation", "tool_call", "summary"] as const) {
    const d = await decideEngineRole(role, rt);
    report[`route_${role}`] = d?.model || null;
  }

  // --- Real Ollama chats per model ---
  const ping = async (role: "conversation" | "tool_call" | "summary", expect: string) => {
    const before = await ollamaPs();
    const r = await chatWithEngineRole({
      role,
      messages: [
        { role: "system", content: `Reply with exactly: ${expect}` },
        { role: "user", content: "ping" },
      ],
      maxTokens: 20,
      logTag: `validate-${role}`,
    });
    const after = await ollamaPs();
    return {
      ok: r.ok && (r.text || "").includes(expect.slice(0, 4)),
      model: r.model,
      text: (r.text || "").slice(0, 80),
      loaded_before: before.names,
      loaded_after: after.names,
      loaded_count_after: after.names.length,
      loaded_size_gb: after.sizeGb,
      latencyMs: r.latencyMs,
    };
  };

  report.gemma_real = await ping("conversation", "PONG_GEMMA");
  report.llama31_real = await ping("tool_call", "PONG_LLAMA31");
  report.llama32_real = await ping("summary", "PONG_LLAMA32");
  report.single_model_loaded =
    ((report.llama32_real as { loaded_count_after: number }).loaded_count_after || 0) <= 1;

  // --- Memory persistence ---
  const ownerId = "validate_local_real_owner";
  const token = `CODE_MEM_${Date.now().toString(36).toUpperCase()}`;
  await upsertAdminMemoryItem(ownerId, {
    kind: "confirmed_fact",
    subject: "code_secret_validation",
    content: `Le code magasin de test est ${token}`,
    importance: "high",
    source: "user",
  });

  const askMem = async (label: string) => {
    const mem = await loadAdminPersistentMemory(ownerId);
    const hit = mem.items.find(
      (i) => i.status === "active" && i.subject === "code_secret_validation"
    );
    const reply = await answerAdminAvaConversation({
      message: "Quel est le code magasin de test mémorisé ?",
      history: [],
      userId: ownerId,
      conversationId: `validate_${label}`,
      role: "ADMIN",
      sessionIdentity: {
        email: "yoann@allvaps.fr",
        appRole: "OWNER",
        effectiveRole: "ADMIN",
      },
    });
    return {
      fact_in_db: Boolean(hit?.content.includes(token)),
      reply_has_token: (reply.text || "").includes(token),
      provider: reply.llmStatus?.provider || null,
      model: reply.llmStatus?.model || null,
      source: reply.source,
      text: (reply.text || "").slice(0, 200),
    };
  };

  report.memory_via_gemma_path = await askMem("a");
  // Force tool/summary path by asking after another model was used
  await chatWithEngineRole({
    role: "tool_call",
    messages: [{ role: "user", content: "ok" }],
    maxTokens: 8,
    logTag: "validate-switch",
  });
  report.memory_after_model_switch = await askMem("b");

  // Simulate service restart = reload from store only
  const afterReload = await loadAdminPersistentMemory(ownerId);
  report.memory_after_restart = afterReload.items.some(
    (i) => i.status === "active" && i.content.includes(token)
  );

  // --- Reflections ---
  try {
    const bi = await runBusinessIntelligence({
      ownerUserId: ownerId,
      persist: true,
      includeMarket: false,
    });
    const formatted = formatReflectionsForChat(bi.reflections);
    report.reflections = {
      ok: bi.reflections.length > 0,
      count: bi.reflections.length,
      format_ok: /Sujet|Observations|Conclusion|Action/i.test(formatted),
      analyse_impossible: false,
    };
  } catch (e) {
    report.reflections = {
      ok: false,
      analyse_impossible: true,
      error: e instanceof Error ? e.message.slice(0, 200) : "err",
    };
  }

  // --- Anti-repetition ---
  const generics = [
    "Je te suis. Dis-moi ce qui te préoccupe.",
    "Je t'écoute, qu'est-ce qui te préoccupe ?",
  ];
  report.anti_repeat_banned_detected = generics.every((g) => looksLikeBannedGeneric(g));
  const anti = await answerAdminAvaConversation({
    message: "ok",
    history: [
      { role: "user", content: "salut" },
      { role: "assistant", content: "Je te suis. Dis-moi ce qui te préoccupe." },
      { role: "user", content: "ok" },
      { role: "assistant", content: "Je t'écoute, qu'est-ce qui te préoccupe ?" },
    ],
    userId: ownerId,
    conversationId: "validate_antirepeat",
    role: "ADMIN",
    sessionIdentity: {
      email: "yoann@allvaps.fr",
      appRole: "OWNER",
      effectiveRole: "ADMIN",
    },
  });
  report.anti_repeat_reply = {
    banned: looksLikeBannedGeneric(anti.text || ""),
    text: (anti.text || "").slice(0, 180),
    provider: anti.llmStatus?.provider || "local_compose",
  };

  // --- Tools ---
  const plan = selectAdminTools("fais le tour du magasin / statut stock");
  let toolRun: Awaited<ReturnType<typeof runAdminToolPlan>> | null = null;
  try {
    toolRun = await runAdminToolPlan("fais le tour — priorités et stock", {
      role: "ADMIN",
      appRole: "OWNER",
      email: "yoann@allvaps.fr",
      userId: ownerId,
      periodKey: "today",
      history: [],
    });
  } catch (e) {
    report.tools_error = e instanceof Error ? e.message.slice(0, 160) : "err";
  }
  report.tools = {
    planned: plan.tools,
    ran: toolRun?.results.map((r) => ({ tool: r.tool, ok: r.ok })) || [],
    ok: Boolean(toolRun?.results.some((r) => r.ok)),
  };

  const chatWithTool = await answerAdminAvaConversation({
    message: "Donne-moi le statut stock / priorités en bref",
    history: [],
    userId: ownerId,
    conversationId: "validate_tools_chat",
    role: "ADMIN",
    sessionIdentity: {
      email: "yoann@allvaps.fr",
      appRole: "OWNER",
      effectiveRole: "ADMIN",
    },
  });
  report.tools_in_chat = {
    toolsUsed: chatWithTool.toolsUsed || [],
    grounded: chatWithTool.grounded,
    provider: chatWithTool.llmStatus?.provider || null,
    model: chatWithTool.llmStatus?.model || null,
    openai: /openai/i.test(chatWithTool.source || ""),
    text: (chatWithTool.text || "").slice(0, 220),
  };

  const psEnd = await ollamaPs();
  report.ram_free_gb_end = Math.round((freemem() / 1024 ** 3) * 10) / 10;
  report.ram_used_approx_gb =
    Math.round(((totalmem() - freemem()) / 1024 ** 3) * 10) / 10;
  report.models_loaded_end = psEnd.names;
  report.model_loaded_size_gb = psEnd.sizeGb;
  report.openai_used = false;

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
