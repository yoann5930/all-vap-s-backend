/**
 * Tests E2E cerveau A.V.A. Admin — local only, OpenAI off.
 * Mémoire cross-modèle, anti-répétition, réflexions, conversation 30 tours.
 *
 * Usage:
 *   AVA_LLM_PROVIDER=local npx tsx scripts/smoke-ava-admin-brain-e2e.ts
 */
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

// Force local provider before imports that read env at call-time
process.env.AVA_LLM_PROVIDER = "local";
delete process.env.OPENAI_API_KEY;

function loadDotEnv() {
  for (const p of [".env.local", ".env"]) {
    const full = resolve(process.cwd(), p);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "OPENAI_API_KEY") continue; // never enable OpenAI in this smoke
      if (!(k in process.env) || !process.env[k]) process.env[k] = v;
    }
  }
}
loadDotEnv();
process.env.AVA_LLM_PROVIDER = "local";
delete process.env.OPENAI_API_KEY;

async function main() {
  const {
    answerAdminAvaConversation,
  } = await import("../lib/ava-gestion/admin-conversation");
  const {
    loadAdminPersistentMemory,
    upsertAdminMemoryItem,
  } = await import("../lib/ava/admin-memory");
  const { runBusinessIntelligence, formatReflectionsForChat } = await import(
    "../lib/ava/business-intelligence"
  );
  const { chatWithEngineRole, getReachableRuntime, decideEngineRole } = await import(
    "../lib/ai/local"
  );
  const { looksLikeBannedGeneric, isTooSimilarToRecent } = await import(
    "../lib/ava/admin-memory"
  );

  const ownerId = "smoke_ava_brain_e2e_owner";
  const conversationId = `smoke_conv_${Date.now().toString(36)}`;
  const report: Record<string, string | number | boolean> = {};

  const rt = await getReachableRuntime();
  report.runtime = rt?.id || "none";
  report.reachable = Boolean(rt);

  const roles = ["conversation", "tool_call", "summary"] as const;
  for (const role of roles) {
    const d = await decideEngineRole(role, rt);
    report[`role_${role}`] = d?.model || "none";
  }

  // --- Mémoire cross-modèle ---
  const secretDecision = `Décision smoke E2E : promo vitrine Hautmont le ${new Date().toISOString().slice(0, 10)}`;
  let mem = await loadAdminPersistentMemory(ownerId);
  await upsertAdminMemoryItem(ownerId, {
    kind: "pending_decision",
    subject: "promo_vitrine_hautmont",
    content: secretDecision,
    importance: "high",
    source: "user",
  });
  void mem;

  const gemmaOrMain = await chatWithEngineRole({
    role: "conversation",
    messages: [
      {
        role: "system",
        content:
          "Tu es A.V.A. Réponds brièvement. Utilise uniquement le CONTEXTE fourni.",
      },
      {
        role: "user",
        content: `CONTEXTE UTILE :\n- [pending_decision] promo_vitrine_hautmont: ${secretDecision}\n\nQuestion : Quelle décision a été prise pour la vitrine Hautmont ?`,
      },
    ],
    maxTokens: 120,
    logTag: "smoke-mem-main",
  });
  report.memory_main_model = gemmaOrMain.model;
  report.memory_main_ok =
    gemmaOrMain.ok &&
    /hautmont|vitrine|promo/i.test(gemmaOrMain.text || "");

  const llamaTool = await chatWithEngineRole({
    role: "tool_call",
    messages: [
      {
        role: "system",
        content: "Tu es A.V.A. Réponds en une phrase avec le fait mémorisé.",
      },
      {
        role: "user",
        content: `CONTEXTE UTILE :\n- [pending_decision] promo_vitrine_hautmont: ${secretDecision}\n\nRappelle la décision vitrine.`,
      },
    ],
    maxTokens: 100,
    logTag: "smoke-mem-llama",
  });
  report.memory_cross_model_ok =
    llamaTool.ok && /hautmont|vitrine|promo/i.test(llamaTool.text || "");

  // --- Réflexions ---
  try {
    const bi = await runBusinessIntelligence({
      ownerUserId: ownerId,
      persist: true,
      includeMarket: false,
    });
    report.reflections_count = bi.reflections.length;
    report.reflections_ok = bi.reflections.length > 0;
    report.reflections_format_ok = /Sujet|Observations|Conclusion|Action/i.test(
      formatReflectionsForChat(bi.reflections)
    );
  } catch (e) {
    report.reflections_ok = false;
    report.reflections_error = e instanceof Error ? e.message.slice(0, 120) : "err";
  }

  // --- Conversation 30 messages (local compose + LLM) ---
  const turns: string[] = [
    "Salut A.V.A.",
    "On parle de la vitrine Hautmont.",
    "Mémorise : on lance une promo vitrine ce week-end à Hautmont.",
    "Ok, note aussi que Le Quesnoy reste inchangé.",
    "Qu'est-ce qu'on a décidé pour Hautmont ?",
    "Mets cette décision en pause.",
    "Parlons stock Twenty.",
    "Résume en une phrase le sujet stock.",
    "On reprend la décision vitrine.",
    "Corrige : ce n'est pas ce week-end, c'est lundi prochain.",
    "Quelle est la date corrigée de la promo ?",
    "Fais un résumé de notre fil.",
    "Dis-moi ce que tu ne sais pas encore.",
    "Propose une action concrète pour la vitrine.",
    "Je ne suis pas d'accord avec une remise agressive.",
    "Donne ton avis.",
    "Classe : urgent / à surveiller / info — la promo.",
    "Réponds très court : ça va ?",
    "Maintenant plus détaillé : plan en 3 points.",
    "Retourne au sujet Le Quesnoy.",
    "Puis reviens à Hautmont.",
    "Rappelle la correction sur la date.",
    "Évite de me redire « je te suis ».",
    "Quels outils pourrais-tu utiliser pour vérifier le stock ?",
    "Ne lance rien de sensible sans confirmation.",
    "Tu te souviens de la promo ?",
    "Et de la correction lundi ?",
    "Fais une réflexion métier structurée sur la vitrine.",
    "Résume toute la conversation en 4 puces.",
    "Merci, on reprend demain.",
  ];

  const history: { role: "user" | "assistant"; content: string }[] = [];
  let okTurns = 0;
  let bannedHits = 0;
  let repeatHits = 0;
  const fingerprints: string[] = [];

  for (let i = 0; i < turns.length; i++) {
    const msg = turns[i];
    const reply = await answerAdminAvaConversation({
      message: msg,
      history,
      userId: ownerId,
      conversationId,
      role: "ADMIN",
      sessionIdentity: {
        email: "yoann@allvaps.fr",
        appRole: "OWNER",
        effectiveRole: "ADMIN",
      },
    });
    const text = reply.text || "";
    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: text });
    if (text.trim().length > 8) okTurns += 1;
    if (looksLikeBannedGeneric(text)) bannedHits += 1;
    if (isTooSimilarToRecent(text, fingerprints)) repeatHits += 1;
    fingerprints.push(text.slice(0, 120));
    if (fingerprints.length > 8) fingerprints.shift();
    console.log(`[${i + 1}/${turns.length}] user=${msg.slice(0, 40)} → ${text.slice(0, 80).replace(/\n/g, " ")}`);
  }

  report.conversation_30_ok = okTurns >= 28;
  report.conversation_ok_turns = okTurns;
  report.anti_repeat_banned = bannedHits;
  report.anti_repeat_similar = repeatHits;
  report.anti_repeat_ok = bannedHits <= 2 && repeatHits <= 4;
  report.openai_required = false;

  // Persistence after "restart" = reload memory from store
  const after = await loadAdminPersistentMemory(ownerId);
  const stillThere = after.items.some(
    (i) =>
      i.status === "active" &&
      /promo_vitrine_hautmont|hautmont/i.test(i.subject + i.content)
  );
  report.memory_after_reload_ok = stillThere;

  console.log("\n=== RAPPORT smoke-ava-admin-brain-e2e ===");
  console.log(JSON.stringify(report, null, 2));

  const critical =
    report.reachable &&
    report.memory_cross_model_ok &&
    report.reflections_ok &&
    report.conversation_30_ok &&
    report.memory_after_reload_ok;

  process.exit(critical ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
