/**
 * 10 scénarios comportement social Admin A.V.A. (déterministes, hors DB/OpenAI).
 * npx tsx scripts/smoke-ava-admin-social-behavior.ts
 */
import {
  detectSocialMove,
  composeSocialReply,
  buildStance,
  nextThreadAfterTurn,
  firstNameFromEmail,
  type ActiveThread,
} from "../lib/ava/admin-social";
import { looksLikeChatbot } from "../lib/ava/admin-voice";

let failed = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log("OK", name);
  else {
    failed += 1;
    console.log("FAIL", name, detail ?? "");
  }
}

function notRobot(text: string): boolean {
  return (
    !looksLikeChatbot(text) &&
    !/comment puis[- ]je|je comprends votre demande|je t['’]écoute/i.test(text) &&
    !/^Voici ce que je peux faire/i.test(text)
  );
}

// 1. discussion légère
{
  const d = detectSocialMove("Ça va ?");
  ok("1 move check_in", d.move === "check_in");
  const text = composeSocialReply({
    move: "check_in",
    ownerFirstName: "Yoann",
    message: "Ça va ?",
    resolvedSubject: null,
    activeThread: null,
    workSignal: "Les fruités frais tournent bien aujourd'hui.",
    stance: null,
    memoryHint: null,
  });
  ok("1 naturel + rebond", /ça va/i.test(text) && /fruit/i.test(text) && notRobot(text), text);
}

// 2. désaccord
{
  const d = detectSocialMove("Faisons -30 % sur la gamme X");
  ok("2 move disagree", d.move === "disagree_prompt", d);
  const stance = buildStance({
    subject: "gamme X",
    workSignal: "stock faible sur les références qui tournent",
    userProposal: "Faisons -30 %",
  });
  const text = composeSocialReply({
    move: "disagree_prompt",
    ownerFirstName: "Yoann",
    message: "Faisons -30 %",
    resolvedSubject: "gamme X",
    activeThread: null,
    workSignal: "stock faible",
    stance,
    memoryHint: null,
  });
  ok(
    "2 désaccord argumenté",
    (/pas d'accord|ne (partirais|suis pas|ferais)|freinerais|ne commencerais/i.test(text) ||
      /rupture|visibilit|mise en avant/i.test(text)) &&
      notRobot(text),
    text
  );
}

// 3. idée commerciale
{
  const stance = buildStance({
    subject: "baisse ventes gamme X",
    workSignal: "ventes en baisse, stock élevé, conversion correcte",
  });
  const text = composeSocialReply({
    move: "ask_opinion",
    ownerFirstName: "Yoann",
    message: "Tu en penses quoi ?",
    resolvedSubject: "baisse ventes gamme X",
    activeThread: null,
    workSignal: "ventes en baisse",
    stance,
    memoryHint: null,
  });
  ok("3 idée / avis", /mise en avant|prix|visibilit|avis|tester/i.test(text) && notRobot(text), text);
}

// 4. reprise d'un sujet ancien
{
  const thread: ActiveThread = {
    subject: "promo gamme X",
    summary: "On hésitait entre mise en avant et -30 %.",
    status: "deferred",
    deferredNote: "reporté à demain",
    updatedAt: new Date().toISOString(),
  };
  const d = detectSocialMove("On reprend ?", [], thread);
  ok("4 move resume", d.move === "resume" && d.resolvedSubject?.includes("promo"));
  const text = composeSocialReply({
    move: "resume",
    ownerFirstName: "Yoann",
    message: "On reprend ?",
    resolvedSubject: thread.subject,
    activeThread: thread,
    workSignal: null,
    stance: null,
    memoryHint: null,
  });
  ok("4 reprend le fil", /promo gamme x/i.test(text) && /reprend/i.test(text) && notRobot(text), text);
}

// 5. problème stock
{
  const text = composeSocialReply({
    move: "greeting",
    ownerFirstName: "Yoann",
    message: "Salut",
    resolvedSubject: null,
    activeThread: null,
    workSignal: "Urgent — stocks négatifs : 3 références à Hautmont.",
    stance: null,
    memoryHint: null,
  });
  ok("5 initiative stock", /hautmont|stock/i.test(text) && /salut yoann/i.test(text) && notRobot(text), text);
}

// 6. baisse de ventes
{
  const stance = buildStance({
    subject: "ventes gamme Y",
    workSignal: "baisse CA environ 28 % vs période précédente",
  });
  ok("6 stance anti-promo auto", /mise en avant|prix/i.test(stance.position + stance.reason));
}

// 7. demande vague
{
  const d = detectSocialMove("Tu en penses quoi ?", [
    { role: "user", content: "La gamme X ralentit." },
    {
      role: "assistant",
      content: "La gamme X a ralenti. Je testerais une mise en avant avant le prix.",
    },
  ]);
  ok("7 sujet résolu", d.move === "ask_opinion" && /gamme x/i.test(d.resolvedSubject || ""), d);
}

// 8. simple salut
{
  const d = detectSocialMove("Salut");
  ok("8 greeting", d.move === "greeting" && d.wantTools);
  const text = composeSocialReply({
    move: "greeting",
    ownerFirstName: "Yoann",
    message: "Salut",
    resolvedSubject: null,
    activeThread: null,
    workSignal: null,
    stance: null,
    memoryHint: null,
  });
  ok("8 pas menu", notRobot(text) && !/stocks, commandes/i.test(text), text);
}

// 9. tu en penses quoi
{
  const d = detectSocialMove("Tu en penses quoi ?", [], {
    subject: "stocks Hautmont",
    summary: "Rupture probable sur deux résistances.",
    status: "open",
    updatedAt: new Date().toISOString(),
  });
  ok("9 opinion sur fil", d.move === "ask_opinion" && /hautmont/i.test(d.resolvedSubject || ""));
  const text = composeSocialReply({
    move: "ask_opinion",
    ownerFirstName: null,
    message: "Tu en penses quoi ?",
    resolvedSubject: "stocks Hautmont",
    activeThread: null,
    workSignal: "rupture probable",
    stance: buildStance({
      subject: "stocks Hautmont",
      workSignal: "rupture probable résistances",
    }),
    memoryHint: null,
  });
  ok("9 avis sans redemander le sujet entier", !/comment puis/i.test(text) && text.length > 20, text);
}

// 10. on verra demain
{
  const d = detectSocialMove("On verra ça demain.", [], {
    subject: "mise en avant gamme X",
    summary: "Test 7 jours proposé.",
    status: "open",
    updatedAt: new Date().toISOString(),
  });
  ok("10 defer", d.move === "defer" && !d.wantTools);
  const text = composeSocialReply({
    move: "defer",
    ownerFirstName: "Yoann",
    message: "On verra ça demain.",
    resolvedSubject: "mise en avant gamme X",
    activeThread: {
      subject: "mise en avant gamme X",
      summary: "Test 7 jours proposé.",
      status: "open",
      updatedAt: new Date().toISOString(),
    },
    workSignal: null,
    stance: null,
    memoryHint: null,
  });
  const next = nextThreadAfterTurn({
    move: "defer",
    previous: {
      subject: "mise en avant gamme X",
      summary: "Test 7 jours",
      status: "open",
      updatedAt: new Date().toISOString(),
    },
    subject: "mise en avant gamme X",
    assistantText: text,
    userMessage: "On verra ça demain.",
  });
  ok("10 mémoire reportée", next?.status === "deferred" && /demain|reprend/i.test(text) && notRobot(text), {
    text,
    next,
  });
}

ok("prénom Yoann", firstNameFromEmail("yoann@allvaps.fr") === "Yoann");
ok(
  "identité honnête",
  /pas une personne physique|ia métier/i.test(
    composeSocialReply({
      move: "identity",
      ownerFirstName: null,
      message: "Es-tu une vraie personne ?",
      resolvedSubject: null,
      activeThread: null,
      workSignal: null,
      stance: null,
      memoryHint: null,
    })
  )
);

console.log(`\n${10 - Math.min(failed, 10)}/10 scénarios principaux (échecs totaux: ${failed})`);
if (failed) process.exit(1);
console.log("Smoke social Admin : OK");
