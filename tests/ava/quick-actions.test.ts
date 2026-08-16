/**
 * Tests actions rapides A.V.A. — scénarios 1–9 (logique)
 * npm run ava:quick-actions:test
 */
import {
  AVA_QUICK_ACTIONS,
  AVA_QUICK_ACTION_ORDER,
  intentFromLabel,
  writePendingIntent,
  consumePendingIntent,
  readPendingIntent,
  openAvaWithIntent,
  type AvaQuickIntent,
} from "../../lib/ava/quick-actions";
import {
  startQuickFlow,
  continueQuickFlow,
  matchQuickIntentFromMessage,
} from "../../lib/ava/quick-flows";

let ok = 0;
let fail = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    ok++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

console.log("\n=== AVA Quick Actions ===\n");

// Source de vérité
{
  assert(AVA_QUICK_ACTION_ORDER.length === 4, "4 boutons rapides (hors CTA général)");
  assert(
    AVA_QUICK_ACTIONS.OPEN_GENERAL_CHAT.initialMessage === null,
    "OPEN_GENERAL_CHAT sans message faux"
  );
  assert(
    intentFromLabel("Je débute la vape") === "BEGINNER_VAPING",
    "label → intent BEGINNER"
  );
}

// SCÉNARIO 1
{
  const intent: AvaQuickIntent = "BEGINNER_VAPING";
  const cfg = AVA_QUICK_ACTIONS[intent];
  const started = startQuickFlow(intent)!;
  assert(Boolean(cfg.initialMessage), "S1 message initial défini");
  assert(cfg.flow === "BEGINNER_ONBOARDING", "S1 flow BEGINNER_ONBOARDING");
  assert(
    /combien de cigarettes/i.test(started.content),
    "S1 première question cigarettes"
  );
  assert(
    !/que recherchez-vous/i.test(started.content),
    "S1 pas de question générique"
  );
  assert(
    matchQuickIntentFromMessage(cfg.initialMessage!) === intent,
    "S1 match message → intent"
  );
}

// SCÉNARIO 2
{
  const started = startQuickFlow("NICOTINE_GUIDANCE")!;
  assert(
    AVA_QUICK_ACTIONS.NICOTINE_GUIDANCE.flow === "NICOTINE_SELECTION",
    "S2 flow NICOTINE_SELECTION"
  );
  assert(/taux|nicotine|cigarettes|vapotez/i.test(started.content), "S2 parcours nicotine");
  assert(!/que recherchez-vous/i.test(started.content), "S2 pas générique");
}

// SCÉNARIO 3
{
  const started = startQuickFlow("FRUIT_FLAVOUR_GUIDANCE")!;
  assert(
    AVA_QUICK_ACTIONS.FRUIT_FLAVOUR_GUIDANCE.flow === "FRUIT_FLAVOUR_SELECTION",
    "S3 flow FRUIT_FLAVOUR_SELECTION"
  );
  assert(/fruit simple|mélange/i.test(started.content), "S3 préférences fruitées");
  assert(!/que recherchez-vous/i.test(started.content), "S3 pas générique");
}

// SCÉNARIO 4
{
  const started = startQuickFlow("BEGINNER_DEVICE_GUIDANCE")!;
  assert(
    AVA_QUICK_ACTIONS.BEGINNER_DEVICE_GUIDANCE.flow === "BEGINNER_DEVICE_SELECTION",
    "S4 flow BEGINNER_DEVICE_SELECTION"
  );
  assert(/matériel|début/i.test(started.content), "S4 matériel débutant");
  const step = continueQuickFlow(started.state!, "Je veux une puff JNR");
  assert(/puff|jnr|jetable|exclus/i.test(step.content), "S4 refus Puff/JNR");
}

// SCÉNARIO 5
{
  assert(startQuickFlow("OPEN_GENERAL_CHAT") === null, "S5 pas de faux parcours");
  assert(
    matchQuickIntentFromMessage("bonjour") === null,
    "S5 message libre ≠ intention rapide"
  );
}

// SCÉNARIO 6 — idempotence message
{
  const a = matchQuickIntentFromMessage(
    AVA_QUICK_ACTIONS.BEGINNER_VAPING.initialMessage!
  );
  const b = matchQuickIntentFromMessage(
    AVA_QUICK_ACTIONS.BEGINNER_VAPING.initialMessage!
  );
  assert(a === b && a === "BEGINNER_VAPING", "S6 même intent (pas de double flow côté match)");
}

// Progression débutant
{
  const s0 = startQuickFlow("BEGINNER_VAPING")!;
  const s1 = continueQuickFlow(s0.state!, "Oui, je fume encore");
  assert(s1.continueFlow && s1.state?.step === 2, "débutant → step 2 cigarettes/jour");
  assert(/cigarettes par jour/i.test(s1.content), "question quantité");
}

// Fruits → catalogue hint
{
  const s0 = startQuickFlow("FRUIT_FLAVOUR_GUIDANCE")!;
  const s1 = continueQuickFlow(s0.state!, "Mélange de fruits");
  const s2 = continueQuickFlow(s1.state!, "Frais");
  const s3 = continueQuickFlow(s2.state!, "Sucrée");
  const end = continueQuickFlow(s3.state!, "Fruits rouges");
  assert(!end.continueFlow, "fruits termine le flow");
  assert(end.catalogHint?.flavorFamily === "fruits_rouges", "hint fruits rouges");
}

// Persistance intention (sessionStorage mock) — S8 consommation unique
{
  const store: Record<string, string> = {};
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  };
  (globalThis as unknown as { window: unknown }).window = globalThis;

  const events: unknown[] = [];
  (globalThis as unknown as { dispatchEvent: (e: unknown) => boolean }).dispatchEvent = (
    e: unknown
  ) => {
    events.push(e);
    return true;
  };

  writePendingIntent({
    id: "test-id-1",
    intent: "BEGINNER_VAPING",
    createdAt: Date.now(),
    consumed: false,
  });
  const first = consumePendingIntent("test-id-1");
  const second = consumePendingIntent("test-id-1");
  assert(Boolean(first), "S8 première consommation OK");
  assert(second === null, "S8 pas de double consommation");
  assert(readPendingIntent() === null, "S8 pending lu comme consommé/absent");

  openAvaWithIntent("OPEN_GENERAL_CHAT");
  openAvaWithIntent("OPEN_GENERAL_CHAT");
  assert(events.length >= 1, "S5/S6 open général dispatché");
}

console.log(`\nRésultat: ${ok} OK, ${fail} FAIL\n`);
if (fail > 0) process.exit(1);
