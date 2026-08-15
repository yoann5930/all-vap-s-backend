/**
 * LLM production pour le cerveau central AVA.
 * OpenAI uniquement — pas d'Ollama / localhost / gemma local.
 */
export type AvaProductionLlmRequest = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  preferShort?: boolean;
  maxTokens?: number;
  logTag?: string;
};

export type AvaProductionLlmResult = {
  ok: boolean;
  text: string | null;
};

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function chatWithAvaLlm(
  req: AvaProductionLlmRequest,
): Promise<AvaProductionLlmResult> {
  const key = envTrim("OPENAI_API_KEY");
  const model = envTrim("OPENAI_MODEL", "gpt-4o-mini") || "gpt-4o-mini";
  const tag = req.logTag || "ava-brain-llm";
  if (!key) {
    console.warn("AVA_TOOL_ERROR tool=llm kind=missing_key");
    return { ok: false, text: null };
  }

  const ctrl = new AbortController();
  const timeoutMs = Number(envTrim("AVA_LLM_TIMEOUT_MS", "20000")) || 20000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? (req.preferShort ? 180 : 320),
        temperature: req.preferShort ? 0.45 : 0.55,
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      console.warn(`AVA_TOOL_ERROR tool=llm http=${res.status} latencyMs=${latencyMs}`);
      return { ok: false, text: null };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    if (!text) {
      console.warn("AVA_TOOL_ERROR tool=llm kind=empty_content");
      return { ok: false, text: null };
    }
    console.info(`[${tag}] provider=openai model=${model} latencyMs=${latencyMs}`);
    return { ok: true, text };
  } catch (error) {
    const kind = error instanceof Error && error.name === "AbortError" ? "timeout" : "network";
    console.warn(`AVA_TOOL_ERROR tool=llm kind=${kind}`);
    return { ok: false, text: null };
  } finally {
    clearTimeout(timer);
  }
}
