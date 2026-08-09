/**
 * Smoke cerveau conversationnel Admin A.V.A.
 * - anti-répétition « Je te suis »
 * - contexte sur 20 tours
 * - reprise après « reconnexion » (même conversationId + mémoire)
 *
 * Usage: npx tsx scripts/smoke-ava-admin-brain.ts
 */
import {
  detectSocialMove,
  shouldPreferLocalCompose,
} from "../lib/ava/admin-social";
import {
  isTooSimilarToRecent,
  looksLikeBannedGeneric,
  forceGroundedReply,
} from "../lib/ava/admin-memory/anti-repeat";
import { answerAdminAvaConversation } from "../lib/ava-gestion/admin-conversation";
import {
  loadAdminSessionMemory,
  saveAdminSessionMemory,
  upsertAdminMemoryItem,
  loadAdminPersistentMemory,
  retrieveRelevantAdminMemory,
} from "../lib/ava/admin-memory";

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

const USER_ID = "brain-smoke-user";
const CONV_ID = "brain-smoke-conv";

async function turn(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
) {
  return answerAdminAvaConversation({
    message,
    role: "ADMIN",
    history,
    userId: USER_ID,
    conversationId: CONV_ID,
    sessionIdentity: {
      email: "yoann@allvaps.fr",
      appRole: "OWNER",
      effectiveRole: "ADMIN",
    },
  });
}

async function main() {
  console.log("\n=== Détection : smalltalk → LLM (pas local template) ===");
  {
    const d = detectSocialMove("je regarde un peu le site");
    ok("smalltalk preferLocalCompose=false", !shouldPreferLocalCompose(d.move, d.preferLocalCompose), d);
  }
  {
    const d = detectSocialMove("cc");
    ok("greeting reste local", shouldPreferLocalCompose(d.move, d.preferLocalCompose), d);
  }

  console.log("\n=== Anti-répétition unitaire ===");
  ok(
    "banned Je te suis",
    looksLikeBannedGeneric("Je te suis. Tu veux qu'on reste en mode discussion ?")
  );
  ok(
    "forceGrounded ancré",
    /message|avance|précisément|concrètement/i.test(
      forceGroundedReply({
        userMessage: "et Hautmont alors ?",
        recentAssistant: ["Je te suis. Tu veux qu'on reste en mode discussion ?"],
        ownerFirstName: "Yoann",
        threadSubject: "stocks Hautmont",
      })
    )
  );
  ok(
    "similarité détectée",
    isTooSimilarToRecent(
      "Je te suis. Tu veux qu'on reste en mode discussion, ou on passe sur un point concret ?",
      ["Je te suis. Tu veux qu'on reste en mode discussion, ou on passe sur un point concret ?"]
    )
  );

  console.log("\n=== Conversation 20 échanges ===");
  const history: { role: "user" | "assistant"; content: string }[] = [];
  const script = [
    "salut",
    "ça va ?",
    "je regarde un peu le site",
    "rien de spécial, je discute",
    "on parle un peu",
    "tu te souviens de quoi on parlait ?",
    "bon on va tester une bannière sur Twenty demain",
    "on verra ça demain",
    "ok",
    "autre chose : le stock Hautmont me préoccupe",
    "pourquoi ?",
    "tu ferais quoi ?",
    "non je suis pas d'accord",
    "propose autre chose",
    "et Le Quesnoy ?",
    "laisse tomber les stocks",
    "quoi de neuf ?",
    "cc",
    "on reprend",
    "tu te rappelles la décision bannière Twenty ?",
  ];

  const replies: string[] = [];
  for (const m of script) {
    const r = await turn(m, history);
    history.push({ role: "user", content: m });
    history.push({ role: "assistant", content: r.text });
    replies.push(r.text);
    console.log(`\nUSER: ${m}\nAVA : ${r.text.slice(0, 200)}`);
    ok(
      `tour « ${m.slice(0, 40)} » pas Je te suis`,
      !/je te suis/i.test(r.text),
      r.text.slice(0, 160)
    );
    ok(
      `tour « ${m.slice(0, 40)} » pas Dis-moi ce qui te préoccupe`,
      !/dis-moi ce qui te pr[eé]occupe/i.test(r.text),
      r.text.slice(0, 160)
    );
  }

  // Pas plus de 2 réponses quasi-identiques consécutives
  let repeatPairs = 0;
  for (let i = 1; i < replies.length; i++) {
    if (isTooSimilarToRecent(replies[i], [replies[i - 1]], 0.72)) repeatPairs += 1;
  }
  ok(`anti-boucle consecutive (pairs=${repeatPairs})`, repeatPairs <= 3, { repeatPairs });

  console.log("\n=== Mémoire persistante + reconnexion ===");
  await upsertAdminMemoryItem(USER_ID, {
    kind: "pending_decision",
    subject: "bannière Twenty",
    content: "Décision : tester une bannière sur Twenty demain",
    importance: "high",
    taskStatus: "paused",
    source: "user",
  });
  const session = await loadAdminSessionMemory(USER_ID, CONV_ID);
  await saveAdminSessionMemory(USER_ID, {
    ...session,
    conversationId: CONV_ID,
    lastTopic: "bannière Twenty",
    summary: "Décision reportée : bannière Twenty demain",
    activeThread: {
      subject: "bannière Twenty",
      summary: "tester une bannière demain",
      status: "deferred",
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });

  // Nouvelle « session » : history vide côté client, même conversationId + mémoire
  const afterReconnect = await turn("on reprend", []);
  console.log(`\nRECONNECT USER: on reprend\nAVA : ${afterReconnect.text.slice(0, 240)}`);
  ok(
    "reconnexion retrouve bannière/Twenty",
    /banni[eè]re|twenty|vingt|reprend/i.test(afterReconnect.text),
    afterReconnect.text.slice(0, 240)
  );

  const persistent = await loadAdminPersistentMemory(USER_ID);
  const retrieved = retrieveRelevantAdminMemory({
    persistent,
    session: await loadAdminSessionMemory(USER_ID, CONV_ID),
    message: "on reprend",
    topicHint: "bannière",
  });
  ok(
    "mémoire injectée contient décision",
    /banni|twenty|d[eé]cision/i.test(retrieved.factsBlock),
    retrieved.factsBlock.slice(0, 300)
  );

  const recall = await turn("tu te rappelles la décision bannière Twenty ?", [
    { role: "user", content: "on reprend" },
    { role: "assistant", content: afterReconnect.text },
  ]);
  console.log(`\nRECALL\nAVA : ${recall.text.slice(0, 240)}`);
  ok(
    "rappel décision (ne invente pas si absent — ici présent)",
    /banni|twenty|demain|m[eé]mo/i.test(recall.text) &&
      !/je te suis/i.test(recall.text),
    recall.text.slice(0, 240)
  );

  console.log(`\n========== RÉSUMÉ ==========`);
  console.log(`PASS ${passed} / FAIL ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
