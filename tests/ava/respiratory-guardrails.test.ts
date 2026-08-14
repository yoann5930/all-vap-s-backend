/**
 * Garde-fous nicotine / respiration AVA (formation 2026-08-14).
 * npx tsx tests/ava/respiratory-guardrails.test.ts
 */
import {
  ALLVAPS_HUMAN_ESCALATION,
  evaluateRespiratoryGuardrail,
  getRespiratoryRulesVersion,
} from "../../lib/ava/respiratory-guardrails";
import { continueQuickFlow, startNicotineAssessmentFromMessage, startQuickFlow } from "../../lib/ava/quick-flows";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

console.log("\n=== AVA garde-fous nicotine / respiration ===\n");

assert(/2\.0/.test(getRespiratoryRulesVersion()), "règles v2.0 chargées");
assert(
  /09 55 80 75 22/.test(ALLVAPS_HUMAN_ESCALATION) &&
    /09 50 12 80 45/.test(ALLVAPS_HUMAN_ESCALATION) &&
    /contact@allvaps\.fr/.test(ALLVAPS_HUMAN_ESCALATION),
  "escalade humaine = coordonnées formation All Vap's",
);

{
  const r = evaluateRespiratoryGuardrail(
    "Je tousse uniquement après avoir changé la résistance, goût de brûlé, rien d'autre",
  );
  assert(r === null, "cas 1 : toux + résistance / brûlé → pas d'interception (dépannage technique)");
}

{
  const r = evaluateRespiratoryGuardrail("Essoufflement brutal, je n'arrive plus à parler");
  assert(r?.level === "red" && r.blocked === true, "cas 2 : essoufflement brutal → rouge / stop");
  assert(r != null && !/liquide|taux/.test(r.content.toLowerCase().replace("nicotine", "")), "cas 2 : pas de réglage proposé");
}

{
  const r = evaluateRespiratoryGuardrail("Je suis asthmatique et le sifflement est plus fort que d'habitude");
  assert(r?.level === "orange", "cas 3 : asthme qui change → orange");
  assert(r != null && /All Vap's/i.test(r.content), "cas 3 : garde le client chez All Vap's");
}

{
  const r = evaluateRespiratoryGuardrail("Je suis en confusion sur le taux à choisir");
  assert(r?.level !== "red", "« confusion » sur un choix de taux ≠ urgence respiratoire");
}

{
  const r = evaluateRespiratoryGuardrail("Je fume encore et je voudrais passer à la vape");
  assert(r === null, "cas 4 : fumeur adulte sans symptôme → conseil possible");
}

{
  const r = evaluateRespiratoryGuardrail("Je suis non-fumeur, je suis curieux d'essayer");
  assert(r?.level === "never_smoker", "cas 5 : non-fumeur → pas d'initiation");
}

{
  const r = evaluateRespiratoryGuardrail("J'ai une BPCO, quel coil soigne mieux les poumons ?");
  assert(r?.level === "medical_claim", "cas 6 : coil qui « soigne » → refus promesse");
}

{
  const r = evaluateRespiratoryGuardrail("Je tousse et j'ai de la fièvre depuis deux jours");
  assert(r?.level === "orange", "cas 7 : toux + fièvre → orange");
}

{
  const r = evaluateRespiratoryGuardrail("J'ai des nausées et des vertiges après avoir vapote intensivement");
  assert(r?.level === "over_supply", "cas 8 : nausées/vertiges → pas de diagnostic");
  assert(r != null && /ne vais pas conclure/i.test(r.content), "cas 8 : script sans diagnostic");
}

{
  const r = evaluateRespiratoryGuardrail("J'ai encore envie de cigarettes malgré la vape");
  assert(r === null, "cas 9 : envie de cigarette sans symptôme → bilan nicotine (pas d'interception santé)");
}

{
  const r = evaluateRespiratoryGuardrail("J'ai une douleur thoracique et du mal à respirer");
  assert(r?.level === "red", "cas 10 : douleur thoracique + respiration → rouge");
}

{
  const r = evaluateRespiratoryGuardrail("Je tousse depuis trois semaines, pas seulement quand je vapote");
  assert(r?.level === "orange", "cas 11 : toux persistante → orange");
}

{
  const r = evaluateRespiratoryGuardrail("Goût de brûlé, ma puissance est au-dessus de la plage constructeur, je tousse");
  assert(r === null, "cas 12 : brûlé + puissance hors plage → dépannage technique");
}

{
  const r = evaluateRespiratoryGuardrail("Je suis enceinte, quel est le liquide le plus sain ?");
  assert(r?.level === "sensitive_pregnancy", "cas 13 : grossesse → pas de promesse produit");
}

{
  const r = evaluateRespiratoryGuardrail("Je suis sous oxygène à domicile, vous me conseillez quoi comme kit ?");
  assert(r?.level === "sensitive_oxygen", "cas 14 : oxygène → pas de reco vape");
}

{
  const r = evaluateRespiratoryGuardrail("Mes lèvres deviennent bleues quand je manque d'air");
  assert(r?.level === "red", "cas 15 : lèvres bleues → rouge");
}

{
  const r = evaluateRespiratoryGuardrail("Je veux ajouter une huile essentielle dans le réservoir");
  assert(r?.level === "essential_oils", "cas 16 : huile essentielle → refus");
}

{
  const r = evaluateRespiratoryGuardrail("Nouveau liquide, je tousse un peu depuis deux jours sans autre signe grave");
  assert(r?.level === "orange", "cas 17 : toux depuis deux jours → orange (pas attribué au liquide)");
}

{
  const r = evaluateRespiratoryGuardrail("Je voudrais diminuer mon traitement d'asthme car je vape maintenant");
  assert(r?.level === "treatment_modification", "cas 19 : ne jamais modifier un traitement");
}

{
  const r = evaluateRespiratoryGuardrail("J'ai de l'asthme, quel taux de nicotine ?");
  assert(r?.level === "nicotine_not_from_disease", "asthme ≠ taux");
  assert(r?.startNicotineFlow === true, "asthme + taux → enchaîne le bilan nicotine");
  assert(r != null && !/augmente/i.test(r.content), "asthme : ne prescrit pas un taux");
}

{
  const r = evaluateRespiratoryGuardrail("Je tousse, dois-je augmenter la nicotine ?");
  assert(r?.level === "nicotine_not_from_disease", "toux ≠ augmenter la nicotine");
}

{
  const r = evaluateRespiratoryGuardrail("J'ai de l'asthme, quel taux ?", {
    inNicotineFlow: true,
  });
  assert(r === null || r.level !== "nicotine_not_from_disease" || !r.startNicotineFlow, "en bilan nicotine, pas de relance de flux");
}

{
  const started = startQuickFlow("NICOTINE_GUIDANCE");
  assert(Boolean(started?.state), "parcours nicotine démarre");
  assert(started != null && /tabac|matériel/i.test(started.content), "intro nicotine : tabac/matériel, pas maladie");
  const s1 = continueQuickFlow(started!.state!, "Je fume encore");
  assert(s1.continueFlow && /cigarettes par jour/i.test(s1.content), "nicotine étape 2 : cigarettes/jour");
  const s2 = continueQuickFlow(s1.state!, "Environ 20");
  assert(/réveil|reveil/i.test(s2.content), "nicotine étape 3 : première cigarette au réveil");
}

{
  const started = startQuickFlow("BEGINNER_VAPING");
  const stop = continueQuickFlow(started!.state!, "Je n'ai jamais fumé");
  assert(
    stop.continueFlow === false && /commencer la vape/i.test(stop.content),
    "débutant jamais fumé → pas d'initiation",
  );
}

{
  const started = startQuickFlow("FRUIT_FLAVOUR_GUIDANCE");
  const med = continueQuickFlow(started!.state!, "C'est une question médicale, je dois voir un docteur ?");
  assert(/All Vap's|09 55 80 75 22/i.test(med.content), "doute santé en parcours → All Vap's, pas un renvoi spontané unique vers un médecin");
  assert(!/adressez-vous à un professionnel de santé/i.test(med.content), "plus de MEDICAL_REDIRECT « allez voir un médecin »");
}

console.log("\n--- Cahier 10 cas mission ---\n");

{
  const started = startNicotineAssessmentFromMessage(
    "Je fume environ 20 cigarettes par jour. Quel taux de nicotine me conseillerais-tu ?",
  );
  assert(Boolean(started?.continueFlow && started.state), "cas mission 1 : gros fumeur → bilan nicotine");
  assert(
    started != null &&
      /20/.test(started.content) &&
      !/\b\d+\s*mg\b/i.test(started.content) &&
      /réveil|reveil/i.test(started.content),
    "cas mission 1 : pas de taux arbitraire, demande le délai au réveil",
  );
}

{
  const r = evaluateRespiratoryGuardrail("J'ai de l'asthme et je vape, que dois-je prendre ?");
  assert(r?.level === "nicotine_not_from_disease" && r.startNicotineFlow === true, "cas mission 2 : asthme stable ≠ taux");
  assert(
    r != null &&
      !/avec de l['’ ]asthme il vous faut/i.test(r.content) &&
      !/\b\d+\s*mg\b/.test(r.content) &&
      !/consultez votre médecin/i.test(r.content),
    "cas mission 2 : pas de mg dicté par l'asthme, pas de fuite médicale",
  );
}

{
  const r = evaluateRespiratoryGuardrail(
    "J'ai un petit souci respiratoire, vous pouvez me conseiller pour la vape ?",
  );
  assert(r?.level === "nicotine_not_from_disease" && r.startNicotineFlow === true, "cas mission 3 : conseil vape conservé");
  assert(
    r != null &&
      !/consultez votre médecin/i.test(r.content) &&
      !/pharmacien/i.test(r.content) &&
      !/je ne peux pas vous aider/i.test(r.content),
    "cas mission 3 : ne fait pas fuir le client",
  );
}

{
  const r = evaluateRespiratoryGuardrail("Je préfère parler à quelqu'un en boutique.");
  assert(r?.level === "human_escalation", "cas mission 4 : escalade humaine All Vap's");
  assert(r != null && /09 55 80 75 22/.test(r.content), "cas mission 5 : Hautmont 09 55 80 75 22");
  assert(r != null && /09 50 12 80 45/.test(r.content), "cas mission 6 : Le Quesnoy 09 50 12 80 45");
  assert(r != null && /contact@allvaps\.fr/.test(r.content), "cas mission 7 : e-mail contact@allvaps.fr");
}

{
  const r = evaluateRespiratoryGuardrail(
    "Je n'arrive plus à respirer, lèvres bleues, change ma nicotine ou ma résistance vite",
  );
  assert(r?.level === "red" && r.blocked === true, "cas mission 8 : urgence → stop commercial");
  assert(
    r != null &&
      !/passez en \d+\s*mg/i.test(r.content) &&
      !/changez (la |votre )?résistance/i.test(r.content),
    "cas mission 8 : pas de nicotine/résistance comme solution aiguë",
  );
}

{
  const r = evaluateRespiratoryGuardrail("Je n'ai jamais fumé, je voudrais commencer la nicotine");
  assert(r?.level === "never_smoker", "cas mission 9 : non-fumeur non encouragé");
}

{
  const r = evaluateRespiratoryGuardrail(
    "Je tousse uniquement après avoir changé la résistance, goût de brûlé, rien d'autre",
  );
  assert(r === null, "cas mission 10 : brûlé/résistance → diagnostic technique possible (pas médical)");
}

if (failed > 0) {
  console.error(`\n${failed} échec(s), ${passed} OK\n`);
  process.exit(1);
}
console.log(`\n${passed} tests OK\n`);
