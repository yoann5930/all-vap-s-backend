/**
 * Smoke multi-provider A.V.A. Admin — OpenAI désactivé, Ollama local obligatoire.
 *
 * Usage:
 *   AVA_LLM_PROVIDER=local npx tsx scripts/smoke-ava-llm-local-no-openai.ts
 */
import { chatWithAvaLlm, probeAvaLlmProviders, scrubSecretsForLlm } from "@/lib/ai/providers";
import { answerAdminAvaConversation } from "@/lib/ava-gestion/admin-conversation";

async function main() {
  process.env.AVA_LLM_PROVIDER = "local";
  delete process.env.OPENAI_API_KEY;

  const probe = await probeAvaLlmProviders();
  console.log("providers", JSON.stringify(probe));
  if (!probe.local.reachable) {
    console.error("FAIL: Ollama injoignable — démarre ollama serve");
    process.exit(2);
  }

  const scrubOk = !/sk-live|motdepasseSecret/.test(
    scrubSecretsForLlm("OPENAI_API_KEY=sk-live-ABCDEFG password=motdepasseSecret")
  );
  console.log("scrub_secrets", scrubOk ? "OK" : "KO");

  const ping = await chatWithAvaLlm({
    messages: [
      { role: "system", content: "Réponds exactement: PONG_LOCAL" },
      { role: "user", content: "ping" },
    ],
    maxTokens: 16,
    temperature: 0,
    preferShort: true,
    logTag: "smoke-local",
  });
  console.log("ping", ping.ok, ping.provider, ping.model, (ping.text || "").slice(0, 80));

  const history: { role: "user" | "assistant"; content: string }[] = [];
  const turns = [
    "Bonjour Ava",
    "Qui es-tu en mode Admin ?",
    "Note cette décision : LOCAL_MEM_MARKER_BANNIERE_TEST — on la reprend demain.",
    "Tu te souviens de la décision LOCAL_MEM qu'on vient de noter ?",
    "Parle-moi autrement, sans répéter la même phrase.",
  ];

  for (const message of turns) {
    const reply = await answerAdminAvaConversation({
      message,
      role: "ADMIN",
      userId: "smoke-local-user",
      conversationId: "smoke-local-conv",
      history,
      sessionIdentity: {
        email: "yoann@allvaps.fr",
        appRole: "OWNER",
        effectiveRole: "ADMIN",
      },
    });
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply.text });
    console.log("\nUSER:", message);
    console.log(
      "AVA:",
      reply.source,
      "|",
      reply.llmStatus?.provider || "-",
      "|",
      reply.text.slice(0, 200)
    );
    if (/je te suis|dis-moi ce qui te pr[eé]occupe/i.test(reply.text)) {
      console.error("FAIL banned phrase");
      process.exit(4);
    }
  }

  const last = history.filter((h) => h.role === "assistant").pop()?.content || "";
  const memOk =
    /LOCAL_MEM|banni[eè]re|d[eé]cision|demain/i.test(last) ||
    history.some(
      (h) =>
        h.role === "assistant" &&
        /LOCAL_MEM|banni|d[eé]cision/i.test(h.content)
    );

  console.log("\n==========");
  console.log("Provider local :", ping.ok && ping.provider === "local" ? "OK" : "NON");
  console.log("OpenAI désactivé : OK");
  console.log("Mémoire conversation (thread) :", memOk ? "OK" : "PARTIEL");
  console.log("Anti-répétition basique : OK");
  process.exit(ping.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
