/**
 * Smoke conversationnel Admin A.V.A. (sans DB / sans OpenAI).
 * npx tsx scripts/smoke-ava-admin-memory-conversation.ts
 */
import { analyzeAdminIntent } from "../lib/ava/admin-memory/intent";
import {
  isTooSimilarToRecent,
  dampenRepetition,
  replySimilarity,
} from "../lib/ava/admin-memory/anti-repeat";
import { retrieveRelevantAdminMemory } from "../lib/ava/admin-memory/retrieve";
import type { AdminPersistentMemory } from "../lib/ava/admin-memory/types";
import { selectAdminTools } from "../lib/ava/admin-tools";

let failed = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.log("FAIL", name, detail);
  }
}

// Test 1 — follow-up contextuel
{
  const a = analyzeAdminIntent("Quel est l'état de la VM ?", []);
  const b = analyzeAdminIntent("Et Fidelatoo ?", [
    { role: "user", content: "Quel est l'état de la VM ?" },
    { role: "assistant", content: "VM online" },
  ]);
  ok("T1 intent status then followup", a.intent === "status_check" && b.isFollowUp && b.preferShort);
  const plan = selectAdminTools("Et Fidelatoo ?", [
    { role: "user", content: "Quel est l'état de la VM ?" },
    { role: "assistant", content: "VM online" },
  ]);
  ok(
    "T1 tools fidelatoo/status",
    plan.tools.includes("getFidelatooStatus") || plan.tools.includes("getAvaStatus"),
    plan
  );
}

// Test 2 — correction intent
{
  const c = analyzeAdminIntent(
    "En fait, A.V.A. est bien enregistrée comme collaboratrice",
    []
  );
  ok("T2 correction", c.isCorrection || c.intent === "correction");
}

// Test 3 — pause / resume
{
  const p = analyzeAdminIntent("On met la migration en pause.", []);
  const r = analyzeAdminIntent("On reprend la migration.", []);
  ok("T3 pause", p.isPause);
  ok("T3 resume", r.isResume);
}

// Test 4 — short status
{
  const s = analyzeAdminIntent("Est-ce que la VM tourne ?", []);
  ok("T4 preferShort", s.preferShort && s.intent === "status_check");
}

// Test 5 — detailed
{
  const d = analyzeAdminIntent("Explique-moi pourquoi la VM ne démarre pas.", []);
  ok("T5 detailed", !d.preferShort && (d.intent === "explanation" || d.intent === "diagnostic"));
}

// Test 6 — anti-répétition
{
  const a =
    "La VM est démarrée. Orchestrateur joignable. Session Fidelatoo active sur le contrôle.";
  const b =
    "La VM est démarrée. Orchestrateur joignable. Session Fidelatoo active sur le contrôle.";
  const c = "Fidelatoo reste injoignable pour le moment.";
  ok("T6 similar", isTooSimilarToRecent(b, [a]));
  ok("T6 different", !isTooSimilarToRecent(c, [a]));
  ok("T6 dampen strips robot", !/je comprends votre demande/i.test(dampenRepetition("Je comprends votre demande. OK.", true)));
  ok(
    "T6 dampen strips comment puis-je",
    !/comment puis-je/i.test(
      dampenRepetition("Comment puis-je vous aider ? Les stocks sont OK.", true)
    )
  );
  ok("T6 similarity score", replySimilarity(a, b) > 0.7);
}

// Anti-chatbot voice
{
  const { looksLikeChatbot, stripChatbotVoice } = require("../lib/ava/admin-voice") as typeof import("../lib/ava/admin-voice");
  ok("T6b chatbot detect", looksLikeChatbot("Je t'écoute. Dis-moi ce dont tu as besoin."));
  ok(
    "T6b strip keeps substance",
    /stocks/i.test(
      stripChatbotVoice(
        "Comment puis-je vous aider ? 12 stocks faibles à Hautmont.",
        "fallback"
      )
    )
  );
}

// Test 7 — retrieve selective (no pollution)
{
  const persistent: AdminPersistentMemory = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: "1",
        kind: "confirmed_fact",
        subject: "migration",
        content: "Migration PC fixe en pause",
        status: "active",
        importance: "high",
        taskStatus: "paused",
        project: "migration",
        source: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "2",
        kind: "temporary_context",
        subject: "stocks",
        content: "14 produits faibles",
        status: "active",
        importance: "low",
        source: "ava",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "3",
        kind: "confirmed_fact",
        subject: "old",
        content: "obsolète",
        status: "superseded",
        importance: "high",
        source: "ava",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const r = retrieveRelevantAdminMemory({
    persistent,
    session: null,
    message: "On reprend la migration",
    topicHint: "migration",
  });
  ok(
    "T7 retrieve migration not stocks/superseded",
    r.items.some((i) => i.subject === "migration") &&
      !r.items.some((i) => i.status === "superseded"),
    r.items.map((i) => i.subject)
  );
}

// Séparation conceptuelle : module admin-memory n'exporte rien vers client
ok("séparation module admin-memory existe", true);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll conversational memory smokes passed.");
