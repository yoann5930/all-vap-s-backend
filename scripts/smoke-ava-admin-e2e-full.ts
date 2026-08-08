/**
 * Batterie E2E A.V.A. Admin — conversation réelle (DB si dispo).
 * Objectif : rendu collègue demandé à 100 %.
 *
 * Usage: npx tsx scripts/smoke-ava-admin-e2e-full.ts
 */
import { answerAdminAvaConversation } from "../lib/ava-gestion/admin-conversation";
import { buildGestionSnapshot } from "../lib/ava-gestion/analytics";
import { resolvePeriod } from "../lib/timezone/shop-tz";
import { stripTechnicalLeak, sanitizeAdminToolError } from "../lib/ava/admin-tools/sanitize-error";
import { looksLikeChatbot } from "../lib/ava/admin-voice";
import {
  detectSocialMove,
  composeSocialReply,
  nextThreadAfterTurn,
  buildStance,
} from "../lib/ava/admin-social";
import { selectAdminTools, assertCanRunAdminTools } from "../lib/ava/admin-tools";
import { AvaError } from "../lib/ava/errors";

type Turn = { role: "user" | "assistant"; content: string };

let failed = 0;
let passed = 0;

function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed += 1;
    console.log("OK ", name);
  } else {
    failed += 1;
    console.log("FAIL", name, detail ?? "");
  }
}

function isCleanColleague(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  if (looksLikeChatbot(text)) return false;
  if (/Invalid\s*`?prisma|invocation:\s*\{|isAudit:\s*false\s*~|findMany\(/i.test(text)) {
    return false;
  }
  if (/comment puis[- ]je|je t['’]écoute|n['’]hésitez pas|je comprends votre demande/i.test(text)) {
    return false;
  }
  if (/^Voici ce que je peux faire/i.test(text)) return false;
  return true;
}

async function ask(message: string, history: Turn[] = []) {
  return answerAdminAvaConversation({
    message,
    role: "ADMIN",
    history,
    userId: "e2e-admin-user",
    conversationId: "e2e-conv-ava-full",
    sessionIdentity: {
      email: "yoann@allvaps.fr",
      appRole: "OWNER",
      effectiveRole: "ADMIN",
    },
  });
}

async function main() {
  console.log("\n=== A. Sanitize technique ===");
  {
    const raw =
      "Invalid `prisma.order.findMany()` invocation: { where: { isAudit: false, ~~~~~~~";
    ok(
      "sanitize prisma",
      sanitizeAdminToolError(raw) === "données métier temporairement indisponibles"
    );
    ok(
      "strip leak",
      stripTechnicalLeak(`Hey Yoann, ${raw} On regarde?`, "safe") === "safe"
    );
  }

  console.log("\n=== B. Snapshot ventes (cause du bug isAudit) ===");
  try {
    const period = resolvePeriod("today", "Europe/Paris");
    const snap = await buildGestionSnapshot(period);
    ok("snapshot builds", typeof snap.orders.received === "number", snap.orders);
    ok("snapshot has period label", Boolean(snap.period?.label));
  } catch (e) {
    ok("snapshot builds", false, e instanceof Error ? e.message : e);
  }

  console.log("\n=== C. Conversation collègue (pipeline complet) ===");
  const history: Turn[] = [];

  async function step(
    user: string,
    checks: (reply: string, meta: Awaited<ReturnType<typeof ask>>) => void
  ) {
    const res = await ask(user, history);
    history.push({ role: "user", content: user });
    history.push({ role: "assistant", content: res.text });
    console.log(`\nUSER: ${user}`);
    console.log(`AVA : ${res.text.slice(0, 280)}${res.text.length > 280 ? "…" : ""}`);
    console.log(`src=${res.source} tools=${(res.toolsUsed || []).join(",") || "-"}`);
    ok(`${user} → clean`, isCleanColleague(res.text), res.text.slice(0, 200));
    checks(res.text, res);
  }

  await step("Salut", (t, meta) => {
    ok(
      "salut nomme Yoann ou rebond métier",
      /yoann|ça va|ca va|salut|hey|coucou/i.test(t) &&
        !/indisponible|pas pu v[eé]rifier/i.test(t),
      t
    );
    ok("salut sans outil métier", !(meta.toolsUsed && meta.toolsUsed.length), meta.toolsUsed);
  });

  await step("Ça va ?", (t) => {
    ok(
      "check-in commence naturel",
      /^ça va|^ca va|oui/i.test(t.trim()) || /ça va/i.test(t),
      t
    );
  });

  await step("Fais le tour", (t, meta) => {
    ok(
      "tour sans prisma",
      !/prisma|invocation|~~~~~~~/i.test(t) &&
        (meta.toolsUsed?.includes("runDailyTour") || t.length > 20),
      { tools: meta.toolsUsed, t: t.slice(0, 160) }
    );
  });

  await step("Faisons -30 % sur la gamme qui ralentit", (t) => {
    ok(
      "désaccord promo",
      /pas d'accord|ne (partirais|suis pas|ferais|commencerais)|freinerais|mise en avant|rupture|visibilit|prix/i.test(
        t
      ),
      t
    );
  });

  await step("Tu en penses quoi ?", (t) => {
    ok(
      "avis contextualisé",
      t.length > 25 &&
        !/comment puis/i.test(t) &&
        (/promo|prix|visibilit|mise en avant|frein|pas d'accord|ne (partirais|commencerais)|%|rupture/i.test(
          t
        ) ||
          !/il me manque encore un détail/i.test(t)),
      t
    );
  });

  await step("On verra ça demain", (t) => {
    ok("defer", /demain|reprend|garde|noté|pause/i.test(t), t);
  });

  await step("On reprend ?", (t) => {
    ok("resume", /reprend/i.test(t), t);
  });

  await step("Quelles anomalies ?", (t, meta) => {
    ok(
      "anomalies tool ou prose",
      meta.toolsUsed?.includes("runAnomalyScan") ||
        /anomal|rien|stock|vente|priorit/i.test(t),
      { tools: meta.toolsUsed, t: t.slice(0, 160) }
    );
  });

  await step("Stocks faibles Hautmont", (t, meta) => {
    ok(
      "stocks hautmont",
      meta.toolsUsed?.some((x) => /Stock|LowStock/i.test(x)) ||
        /stock|hautmont|rupture|faible/i.test(t),
      { tools: meta.toolsUsed, t: t.slice(0, 160) }
    );
  });

  await step("Et si on faisait une bannière 7 jours ?", (t, meta) => {
    ok(
      "simulation/idée",
      (meta.toolsUsed?.includes("simulateBusinessDecision") ||
        /banni|mise en avant|test|scénario|prudent|avis/i.test(t)) &&
        /banni|mise en avant|7\s*jours|visibilit/i.test(t) &&
        !/^Simulation\s*:\s*Stocks faibles/i.test(t),
      { tools: meta.toolsUsed, t: t.slice(0, 220) }
    );
  });

  await step("Es-tu une vraie personne ?", (t) => {
    ok(
      "identité honnête",
      /pas une personne physique|ia|collaboratrice numérique/i.test(t) &&
        !/je suis humaine/i.test(t),
      t
    );
  });

  await step("asdf qwerty zxcv", (t) => {
    ok("vague sans chatbot", isCleanColleague(t) && !/je t['’]écoute/i.test(t), t);
  });

  console.log("\n=== D. Séparation Client / Admin tools ===");
  try {
    assertCanRunAdminTools("CUSTOMER");
    ok("client blocked", false);
  } catch (e) {
    ok("client blocked", e instanceof AvaError);
  }
  ok("bonjour → pas d'outil auto", selectAdminTools("Bonjour").tools.length === 0);

  console.log("\n=== E. Fil social mémoire (déterministe) ===");
  {
    const defer = detectSocialMove("On verra ça demain", [], {
      subject: "mise en avant gamme X",
      summary: "Test 7j",
      status: "open",
      updatedAt: new Date().toISOString(),
    });
    ok("detect defer", defer.move === "defer");
    const thread = nextThreadAfterTurn({
      move: "defer",
      previous: {
        subject: "mise en avant gamme X",
        summary: "Test 7j",
        status: "open",
        updatedAt: new Date().toISOString(),
      },
      subject: "mise en avant gamme X",
      assistantText: "OK demain",
      userMessage: "On verra ça demain",
    });
    ok("thread deferred", thread?.status === "deferred");
    const resume = detectSocialMove("On reprend ?", [], thread);
    ok(
      "detect resume",
      resume.move === "resume" && /gamme x/i.test(resume.resolvedSubject || "")
    );
    const stance = buildStance({
      subject: "promo -30%",
      workSignal: "stock faible",
      userProposal: "faisons -30%",
    });
    const opinion = composeSocialReply({
      move: "disagree_prompt",
      ownerFirstName: "Yoann",
      message: "faisons -30%",
      resolvedSubject: "promo -30%",
      activeThread: thread,
      workSignal: "stock faible",
      stance,
      memoryHint: null,
    });
    ok("compose désaccord clean", isCleanColleague(opinion), opinion);
  }

  console.log("\n=== F. Non-régression anti-chatbot sur 20 phrases ===");
  const phrases = [
    "Salut",
    "Hey",
    "Bonjour Ava",
    "Ça va Ava ?",
    "Merci",
    "OK",
    "Vas-y",
    "Ah oui ?",
    "Pourquoi ?",
    "Et l'autre boutique ?",
    "Je préfère pas",
    "On garde ça pour demain",
    "Reprends ce qu'on avait dit",
    "Que peux-tu faire ?",
    "Point du jour",
    "Rapport complet",
    "Radar marché",
    "Propose des idées",
    "Si tu dirigeais la boutique ?",
    "Supprime tout",
  ];
  for (const p of phrases) {
    const res = await ask(p, []);
    ok(`phrase « ${p} » clean`, isCleanColleague(res.text), res.text.slice(0, 120));
    ok(`phrase « ${p} » no prisma`, !/prisma\.|invocation:/i.test(res.text));
  }

  console.log(`\n========== RÉSUMÉ E2E ==========`);
  console.log(`PASS ${passed} / FAIL ${failed}`);
  if (failed) {
    console.error(`\nA.V.A. Admin E2E INCOMPLET — ${failed} échec(s)`);
    process.exit(1);
  }
  console.log("A.V.A. Admin E2E : 100% OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
