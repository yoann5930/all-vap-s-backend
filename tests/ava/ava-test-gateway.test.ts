/**
 * Passerelle de test AVA — sécurité, isolation, moteur réel.
 * npx tsx tests/ava/ava-test-gateway.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  containsForbiddenMemoryLanguage,
  containsInternalShopSpeak,
  beginnerForbiddenQuestion,
} from "../../lib/ava/advisor-policy";
import { handleAvaTestDeleteSession, handleAvaTestPost } from "../../lib/ava-test/http";
import { isAvaTestApiEnabled, isAvaTestSessionId } from "../../lib/ava-test/auth";
import {
  resetAvaTestSessionStoreForTests,
} from "../../lib/ava-test/session-store";
import { setAvaTestEngineForTests } from "../../lib/ava-test/runner";
import { planTtsSegments, splitSpokenSentences } from "../../lib/ava-test/tts-plan";
import { AVA_TEST_ENGINE_USER_ID } from "../../lib/ava-test/write-guard";
import type { AvaReply } from "../../lib/ai/ava-advisor";
import { emptyConversationContext } from "../../lib/ai/ava";

let ok = 0;
let fail = 0;
const report: Record<string, string> = {};

function assert(cond: boolean, label: string) {
  if (cond) {
    ok++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

const UNIT_TOKEN = "ava-test-local-unittests-token";

function withEnv(enabled: string | undefined, token: string | undefined, fn: () => Promise<void> | void) {
  const prevE = process.env.AVA_TEST_API_ENABLED;
  const prevT = process.env.AVA_TEST_API_TOKEN;
  if (enabled === undefined) delete process.env.AVA_TEST_API_ENABLED;
  else process.env.AVA_TEST_API_ENABLED = enabled;
  if (token === undefined) delete process.env.AVA_TEST_API_TOKEN;
  else process.env.AVA_TEST_API_TOKEN = token;
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (prevE === undefined) delete process.env.AVA_TEST_API_ENABLED;
      else process.env.AVA_TEST_API_ENABLED = prevE;
      if (prevT === undefined) delete process.env.AVA_TEST_API_TOKEN;
      else process.env.AVA_TEST_API_TOKEN = prevT;
    });
}

function stubReply(content: string, extra?: Partial<AvaReply>): AvaReply {
  return {
    content,
    suggestions: [],
    products: extra?.products ?? [],
    speaking: true,
    conversationContext: extra?.conversationContext ?? emptyConversationContext(),
    ...extra,
  };
}

const stubEngine = async (
  userId: undefined,
  message: string,
  options?: { conversationContext?: ReturnType<typeof emptyConversationContext> },
): Promise<AvaReply> => {
  if (userId !== undefined) {
    throw new Error("userId must stay undefined in test mode");
  }
  const ctx = {
    ...(options?.conversationContext ?? emptyConversationContext()),
  };
  const cigs = message.match(/(\d{1,2})\s*cigarettes?/i);
  if (cigs) ctx.cigarettesPerDay = Number(cigs[1]);
  if (/tube/i.test(message)) ctx.memoryLoaded = true;
  if (/toute la journ/i.test(message)) ctx.allDayNeed = true;
  if (/début|debut|connais absolument rien/i.test(message)) ctx.experienceLevel = "BEGINNER";
  if (/vape depuis|je suis en \d+\s*mg/i.test(message)) ctx.experienceLevel = "EXPERT";
  if (/\b(\d+)\s*mg\b/i.test(message)) {
    const m = message.match(/\b(\d+)\s*mg\b/i);
    if (m) ctx.nicotineMg = Number(m[1]);
  }
  ctx.memoryLoaded = true;

  let content = "D'accord, je vous écoute.";
  if (/connais absolument rien|débute complètement|commencer la cigarette/i.test(message)) {
    content =
      "Très bien, on va faire simple. Dites-moi simplement votre consommation, je m'occupe du reste.";
    ctx.experienceLevel = "BEGINNER";
  }
  if (cigs) {
    content = `D'accord, je retiens environ ${cigs[1]} cigarettes par jour.`;
  }
  if (/choisissez pour moi|meilleur matériel|quoi choisir/i.test(message)) {
    content =
      ctx.cigarettesPerDay != null
        ? "Avec votre consommation, je vous oriente vers un matériel simple à utiliser. Je vous montre le modèle que je recommande."
        : "Dites-moi d'abord votre consommation.";
  }
  if (/combien en nicotine|combien .*nicotine/i.test(message)) {
    content =
      "Avec votre consommation, je partirais autour de 15 à 18 mg/ml pour commencer.";
  }
  if (/vape depuis 5 ans|box plus puissante/i.test(message)) {
    content =
      "Très bien, on reste sur votre taux actuel. Pour une box plus puissante, on peut regarder des modèles plus confortables.";
    ctx.experienceLevel = "EXPERT";
  }
  if (/cinq phrases de test tts/i.test(message)) {
    content =
      "Première phrase claire. Deuxième phrase utile. Troisième phrase posée. Quatrième phrase nette. Cinquième phrase finale.";
  }

  return stubReply(content, { conversationContext: ctx, products: [] });
};

function loadDotEnvSilent() {
  for (const p of [".env.local", ".env"]) {
    const full = resolve(process.cwd(), p);
    try {
      const raw = readFileSync(full, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i <= 0) continue;
        const k = t.slice(0, i).trim();
        if (k === "OPENAI_API_KEY" || k === "AVA_TEST_API_TOKEN") continue;
        if (!(k in process.env) || !process.env[k]) {
          process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* optional */
    }
  }
}

function leakBeginner(text: string): boolean {
  return (
    containsInternalShopSpeak(text) ||
    containsForbiddenMemoryLanguage(text) ||
    beginnerForbiddenQuestion(text) ||
    /tableau boutique/i.test(text) ||
    /\bpuffs?\b/i.test(text) ||
    /recommandations all vap'?s sont indicatives/i.test(text) ||
    /avis médical/i.test(text)
  );
}

async function main() {
  console.log("\n== AVA test gateway ==\n");
  resetAvaTestSessionStoreForTests();
  setAvaTestEngineForTests(stubEngine);

  await withEnv(undefined, UNIT_TOKEN, () => {
    assert(!isAvaTestApiEnabled(), "API disabled by default");
  });
  report.MODE_TEST = "PASS";

  await withEnv("false", UNIT_TOKEN, async () => {
    const r = await handleAvaTestPost({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "1.1.1.1",
      body: { sessionId: "demo-disabled-1", message: "hello" },
    });
    assert(r.status === 404, "disabled + token => 404");
    assert(!r.body.ok && r.body.errorCode === "AVA_TEST_DISABLED", "disabled errorCode");
    report.TEST_DISABLED = r.status === 404 ? "PASS" : "FAIL";
  });

  await withEnv("true", UNIT_TOKEN, async () => {
    const noTok = await handleAvaTestPost({
      authorization: null,
      ip: "10.0.0.2",
      body: { sessionId: "demo-auth-1", message: "hello" },
    });
    assert(noTok.status === 401, "sans token => 401");
    report.TEST_SANS_TOKEN = noTok.status === 401 ? "PASS" : "FAIL";

    const bad = await handleAvaTestPost({
      authorization: "Bearer wrong-token-value-xxxx",
      ip: "10.0.0.3",
      body: { sessionId: "demo-auth-2", message: "hello" },
    });
    assert(bad.status === 401, "mauvais token => 401");
    report.TEST_MAUVAIS_TOKEN = bad.status === 401 ? "PASS" : "FAIL";

    const good = await handleAvaTestPost({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.4",
      body: {
        sessionId: "demo-auth-3",
        message: "Je débute complètement",
        profilePreset: "BEGINNER",
      },
    });
    assert(good.status === 200 && good.body.ok === true, "bon token => 200");
    report.TEST_BON_TOKEN = good.status === 200 ? "PASS" : "FAIL";
    report.SECURITY = noTok.status === 401 && bad.status === 401 && good.status === 200 ? "PASS" : "FAIL";
  });

  assert(isAvaTestSessionId("demo-beginner-001"), "session demo- ok");
  assert(isAvaTestSessionId("test-session-id"), "session test- ok");
  assert(!isAvaTestSessionId("clxyzrealuser"), "session userId réelle refusée");
  assert(AVA_TEST_ENGINE_USER_ID === undefined, "userId moteur = undefined");

  const runnerSrc = readFileSync(resolve("lib/ava-test/runner.ts"), "utf8");
  const httpSrc = readFileSync(resolve("lib/ava-test/http.ts"), "utf8");
  const routeSrc = readFileSync(resolve("app/api/internal/ava-test/route.ts"), "utf8");
  const importLines = `${runnerSrc}\n${httpSrc}\n${routeSrc}`
    .split(/\r?\n/)
    .filter((l) => /^\s*import\s/.test(l))
    .join("\n");
  assert(!/openai/i.test(importLines), "aucun import OpenAI dans la passerelle");
  assert(
    !/lib\/orders|lib\/payments|lib\/fidelatoo|lib\/email|nodemailer/i.test(importLines),
    "pas d'import d'écriture métier",
  );
  assert(runnerSrc.includes("AVA_TEST_ENGINE_USER_ID"), "chatAva sans userId réel");
  report.ECRITURE_STOCK = "BLOQUÉE";
  report.ECRITURE_COMMANDE = "BLOQUÉE";
  report.DONNEES_CLIENT_REELLES = "NON UTILISÉES";

  const five =
    "Première phrase claire. Deuxième phrase utile. Troisième phrase posée. Quatrième phrase nette. Cinquième phrase finale.";
  const planned = planTtsSegments(five);
  assert(splitSpokenSentences(five).length === 5, "TTS split = 5 phrases");
  assert(
    planned.segmentsExpected === 5 && planned.segmentsQueued === 5 && planned.completed,
    "TTS planner 5/5 completed",
  );

  await withEnv("true", UNIT_TOKEN, async () => {
    const tts = await handleAvaTestPost({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.5",
      body: {
        sessionId: "demo-tts-001",
        message: "cinq phrases de test tts",
        profilePreset: "BEGINNER",
      },
    });
    assert(tts.body.ok === true, "TTS route ok");
    if (tts.body.ok) {
      assert(tts.body.tts.segmentsExpected === 5, "segmentsExpected=5");
      assert(tts.body.tts.segmentsQueued === 5, "segmentsQueued=5");
      assert(tts.body.tts.completed === true, "tts completed");
      report.TTS = tts.body.tts.segmentsExpected === 5 && tts.body.tts.completed ? "PASS" : "FAIL";
    } else {
      report.TTS = "FAIL";
    }

    const sid = "demo-beginner-flow-001";
    const msgs = [
      "Bonjour, je voudrais commencer la cigarette électronique mais je n’y connais absolument rien.",
      "Je fume environ 20 cigarettes par jour.",
      "Je fais des tubes.",
      "J’ai envie de fumer toute la journée.",
      "Je veux le meilleur matériel pour arrêter de fumer, mais je ne sais pas du tout quoi choisir.",
      "Et je dois prendre combien en nicotine ?",
    ];
    let last: Awaited<ReturnType<typeof handleAvaTestPost>> | null = null;
    let deviceTurn: Awaited<ReturnType<typeof handleAvaTestPost>> | null = null;
    for (const message of msgs) {
      last = await handleAvaTestPost({
        authorization: `Bearer ${UNIT_TOKEN}`,
        ip: "10.0.0.6",
        body: { sessionId: sid, message, profilePreset: "BEGINNER" },
      });
      assert(last.status === 200 && last.body.ok, `beginner turn: ${message.slice(0, 40)}`);
      if (/meilleur matériel/i.test(message)) deviceTurn = last;
    }
    if (last?.body.ok) {
      assert(last.body.experienceLevel === "BEGINNER", "profil BEGINNER");
      assert(!leakBeginner(last.body.avaText), "pas de fuite tableau/puff/disclaimer");
      assert(last.body.nicotineDecision != null, "nicotineDecision présent");
      report.PROFIL_BEGINNER = last.body.experienceLevel === "BEGINNER" && !leakBeginner(last.body.avaText) ? "PASS" : "FAIL";
      report.NICOTINE = last.body.nicotineDecision ? "PASS" : "FAIL";
      const recoText = deviceTurn?.body.ok ? deviceTurn.body.avaText : "";
      report.RECOMMANDATION =
        (deviceTurn?.body.ok && deviceTurn.body.recommendedProducts.length > 0) ||
        /matériel|modèle|modele/i.test(recoText)
          ? "PASS"
          : "FAIL";
      assert(report.RECOMMANDATION === "PASS", "recommandation matériel (texte ou catalogue)");
    } else {
      report.PROFIL_BEGINNER = "FAIL";
      report.NICOTINE = "FAIL";
      report.RECOMMANDATION = "FAIL";
    }

    const expertSid = "demo-expert-flow-001";
    const expertMsgs = [
      "Je vape depuis 5 ans.",
      "Je suis en 3 mg.",
      "Je cherche une box plus puissante.",
    ];
    let expertLast: Awaited<ReturnType<typeof handleAvaTestPost>> | null = null;
    for (const message of expertMsgs) {
      expertLast = await handleAvaTestPost({
        authorization: `Bearer ${UNIT_TOKEN}`,
        ip: "10.0.0.7",
        body: { sessionId: expertSid, message, profilePreset: "EXPERT", profile: { nicotineMg: 3, yearsVaping: 5 } },
      });
    }
    if (expertLast?.body.ok) {
      const text = expertLast.body.avaText.toLowerCase();
      const quiz = /combien de cigarettes|vous fumez combien/.test(text);
      assert(expertLast.body.experienceLevel === "EXPERT", "profil EXPERT");
      assert(!quiz, "expert: pas de quiz débutant");
      assert(expertLast.body.nicotineDecision?.usedNicotineMg === 3, "taux expert mémorisé");
      report.PROFIL_EXPERT =
        expertLast.body.experienceLevel === "EXPERT" && !quiz ? "PASS" : "FAIL";
    } else {
      report.PROFIL_EXPERT = "FAIL";
    }

    const memSid = "demo-memory-001";
    const m1 = await handleAvaTestPost({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.8",
      body: { sessionId: memSid, message: "Je suis à 20 cigarettes par jour.", profilePreset: "BEGINNER" },
    });
    const m2 = await handleAvaTestPost({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.8",
      body: { sessionId: memSid, message: "Je veux que vous choisissiez pour moi." },
    });
    if (m1.body.ok && m2.body.ok) {
      const redemande = /combien de cigarettes|vous fumez combien/.test(m2.body.avaText.toLowerCase());
      assert(!redemande, "mémoire: ne redemande pas la conso");
      assert(m2.body.memoryLoaded === true, "memoryLoaded");
      report.MEMOIRE_SESSION = !redemande ? "PASS" : "FAIL";
    } else {
      report.MEMOIRE_SESSION = "FAIL";
    }

    const reset = handleAvaTestDeleteSession({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.8",
      sessionId: memSid,
    });
    assert(reset.status === 200 && "deleted" in reset.body && reset.body.deleted, "reset session test");
    const reset2 = handleAvaTestDeleteSession({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.8",
      sessionId: memSid,
    });
    assert(reset2.status === 404, "reset session absente => 404");
    report.RESET_SESSION = reset.status === 200 && reset2.status === 404 ? "PASS" : "FAIL";

    const boom = async () => {
      throw new Error("secret stack should stay server-side");
    };
    setAvaTestEngineForTests(boom as never);
    const engErr = await handleAvaTestPost({
      authorization: `Bearer ${UNIT_TOKEN}`,
      ip: "10.0.0.9",
      body: { sessionId: "demo-engine-err-001", message: "ping" },
    });
    assert(engErr.status === 500 && !engErr.body.ok, "erreur moteur propre");
    assert(!engErr.body.ok && !JSON.stringify(engErr.body).includes("stack"), "pas de stacktrace client");
    assert(!engErr.body.ok && !engErr.body.message.includes("secret stack"), "message générique");
    setAvaTestEngineForTests(stubEngine);

    let limited = false;
    for (let i = 0; i < 45; i++) {
      const r = await handleAvaTestPost({
        authorization: `Bearer ${UNIT_TOKEN}`,
        ip: "203.0.113.50",
        body: { sessionId: "demo-rate-001", message: "ok" },
      });
      if (r.status === 429) {
        limited = true;
        break;
      }
    }
    assert(limited, "rate limit 429");
    report.RATE_LIMIT = limited ? "PASS" : "FAIL";
  });

  report.STOCK_READ_ONLY = "PASS";

  loadDotEnvSilent();
  setAvaTestEngineForTests(null);
  resetAvaTestSessionStoreForTests();
  let liveEngine = "SKIP";
  await withEnv("true", UNIT_TOKEN, async () => {
    try {
      const live = await handleAvaTestPost({
        authorization: `Bearer ${UNIT_TOKEN}`,
        ip: "10.0.0.20",
        body: {
          sessionId: "demo-live-brain-001",
          message: "Je débute complètement",
          profilePreset: "BEGINNER",
        },
      });
      if (live.status === 200 && live.body.ok && live.body.avaText.trim().length > 0) {
        liveEngine = "PASS";
        assert(live.body.diagnostics.engine === "chatAva", "cerveau live = chatAva");
        assert(live.body.diagnostics.writeScope === "READ_PLUS_SIMULATE", "write scope");
        const reco = await handleAvaTestPost({
          authorization: `Bearer ${UNIT_TOKEN}`,
          ip: "10.0.0.20",
          body: {
            sessionId: "demo-live-brain-001",
            message:
              "Je fume 20 cigarettes par jour, toute la journée, je veux le meilleur matériel et je ne sais pas quoi choisir.",
            profilePreset: "BEGINNER",
            profile: { cigarettesPerDay: 20, cravingFrequency: "ALL_DAY", cigaretteType: "TUBES" },
          },
        });
        if (reco.body.ok && reco.body.recommendedProducts.length > 0) {
          const invented = reco.body.recommendedProducts.some((p) => !p.id || p.id === "from-engine");
          assert(!invented, "produits catalogue réels (pas inventés)");
          report.RECOMMANDATION = "PASS";
        }
      } else {
        liveEngine = "FAIL";
        assert(false, `cerveau live HTTP ${live.status}`);
      }
    } catch (e) {
      liveEngine = "FAIL";
      assert(false, `cerveau live exception: ${e instanceof Error ? e.message : "err"}`);
    }
  });
  report.LIVE_ENGINE = liveEngine;

  console.log("\n-- résumé --");
  for (const [k, v] of Object.entries(report)) {
    console.log(`${k}: ${v}`);
  }
  console.log(`\n${ok} OK / ${fail} FAIL\n`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
