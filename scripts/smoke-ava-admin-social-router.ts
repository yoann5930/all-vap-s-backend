/**
 * Mission social Admin — routeur d'intention (pas de métier sur salutations).
 * Usage: npx tsx scripts/smoke-ava-admin-social-router.ts
 */
import { detectSocialMove, composeSocialReply, isPureSocialMove } from "../lib/ava/admin-social";
import { selectAdminTools } from "../lib/ava/admin-tools";
import { answerAdminAvaConversation } from "../lib/ava-gestion/admin-conversation";

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

const SOCIAL_MSGS = [
  "cc",
  "salut",
  "ça va ?",
  "quoi de neuf ?",
  "je suis crevé aujourd'hui",
  "on parle un peu",
];

async function live(message: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  return answerAdminAvaConversation({
    message,
    role: "ADMIN",
    history,
    userId: "social-router-user",
    conversationId: "social-router-conv",
    sessionIdentity: {
      email: "yoann@allvaps.fr",
      appRole: "OWNER",
      effectiveRole: "ADMIN",
    },
  });
}

async function main() {
  console.log("\n=== Détection (déterministe) ===");
  for (const m of SOCIAL_MSGS) {
    const d = detectSocialMove(m);
    ok(
      `detect « ${m} » social sans outils`,
      (d.intentClass === "SOCIAL_GREETING" ||
        d.intentClass === "SOCIAL_SMALLTALK" ||
        d.intentClass === "GENERAL_CONVERSATION") &&
        !d.wantTools &&
        isPureSocialMove(d.move),
      d
    );
    ok(
      `selectTools « ${m} » = 0 outil`,
      selectAdminTools(m).tools.length === 0,
      selectAdminTools(m)
    );
  }

  {
    const d = detectSocialMove("bon maintenant regarde les ventes");
    ok("métier ventes → wantTools", d.wantTools && d.move === "work", d);
    ok(
      "selectTools ventes",
      selectAdminTools("bon maintenant regarde les ventes").tools.length > 0,
      selectAdminTools("bon maintenant regarde les ventes")
    );
  }

  {
    const d = detectSocialMove("laisse tomber les ventes");
    ok("leave_work", d.move === "leave_work" && !d.wantTools, d);
  }

  {
    const d = detectSocialMove("tu en penses quoi ?", [], {
      subject: "stocks Hautmont",
      summary: "ruptures",
      status: "open",
      updatedAt: new Date().toISOString(),
    });
    ok("avis sur fil", d.move === "ask_opinion", d);
  }

  {
    const d = detectSocialMove("on reprend ce qu'on disait", [], {
      subject: "promo gamme X",
      summary: "mise en avant",
      status: "deferred",
      updatedAt: new Date().toISOString(),
    });
    ok("resume", d.move === "resume" && /promo/i.test(d.resolvedSubject || ""), d);
  }

  console.log("\n=== Compose (pas d'erreur technique) ===");
  for (const m of ["cc", "salut"]) {
    const text = composeSocialReply({
      move: "greeting",
      ownerFirstName: "Yoann",
      message: m,
      resolvedSubject: null,
      activeThread: null,
      workSignal: "données métier temporairement indisponibles",
      stance: null,
      memoryHint: null,
    });
    ok(
      `compose « ${m} » ignore erreur métier`,
      /salut|coucou|hey/i.test(text) && !/indisponible|données métier/i.test(text),
      text
    );
  }

  console.log("\n=== Live conversation ===");
  const history: { role: "user" | "assistant"; content: string }[] = [];

  for (const m of ["cc", "salut", "ça va ?", "quoi de neuf ?", "on parle un peu"]) {
    const r = await live(m, history);
    history.push({ role: "user", content: m });
    history.push({ role: "assistant", content: r.text });
    console.log(`\nUSER: ${m}\nAVA : ${r.text.slice(0, 180)}`);
    ok(
      `live « ${m} » 0 outil`,
      !(r.toolsUsed && r.toolsUsed.length),
      r.toolsUsed
    );
    ok(
      `live « ${m} » pas d'erreur tech`,
      !/indisponible|pas pu v[eé]rifier|prisma|donn[eé]es m[eé]tier temporaire/i.test(r.text),
      r.text.slice(0, 200)
    );
    ok(
      `live « ${m} » pas menu stock forcé`,
      !/tu veux que je regarde un stock, une commande/i.test(r.text),
      r.text.slice(0, 200)
    );
  }

  {
    const r = await live("bon maintenant regarde les ventes", history);
    history.push({ role: "user", content: "bon maintenant regarde les ventes" });
    history.push({ role: "assistant", content: r.text });
    console.log(`\nUSER: ventes\nAVA : ${r.text.slice(0, 180)}\ntools=${r.toolsUsed}`);
    ok(
      "transition social→métier",
      (r.toolsUsed && r.toolsUsed.length > 0) || /vente|ca|chiffre|période|jour/i.test(r.text),
      { tools: r.toolsUsed, t: r.text.slice(0, 160) }
    );
  }

  {
    const r = await live("laisse tomber les ventes", history);
    console.log(`\nUSER: laisse tomber\nAVA : ${r.text.slice(0, 180)}`);
    ok(
      "transition métier→social",
      !(r.toolsUsed && r.toolsUsed.length) &&
        /laisse|parfait|ok|range|sort/i.test(r.text) &&
        !/indisponible/i.test(r.text),
      r.text
    );
  }

  console.log(`\n========== RÉSUMÉ ==========`);
  console.log(`PASS ${passed} / FAIL ${failed}`);
  console.log(
    failed === 0
      ? "Social router Admin : 100% OK"
      : "Social router Admin : ÉCHECS"
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
