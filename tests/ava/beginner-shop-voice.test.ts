/**
 * AVA — naturalité vendeuse boutique + scénario débutant.
 * npx tsx tests/ava/beginner-shop-voice.test.ts
 */
import { detectClientIntent, isSocialGreeting } from "../../lib/ai/ava/client-intent-router";
import {
  startQuickFlow,
  continueQuickFlow,
  matchQuickIntentFromMessage,
  startFlavorOrientation,
} from "../../lib/ava/quick-flows";
import {
  detectExperienceFromMessage,
  isDeviceRecommendationIntent,
  parseCigarettesPerDay,
  containsInternalShopSpeak,
  shouldSkipBeginnerQuiz,
  resolveExperienceLevel,
} from "../../lib/ava/advisor-policy";
import { beginnerNicotineOrientation } from "../../lib/ava/beginner-nicotine-speak";
import { presentDeviceGuide } from "../../lib/ava/device-guide-present";
import { scrubClientReply } from "../../lib/ava/client-guard";

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

const INTERNAL =
  /tableau boutique|table boutique|moteur|algorithme|avis médical|pas un besoin exact|pas une obligation|sans puff ni jetable|gros fumeurs|dossier client|fiche client/i;

console.log("\n=== AVA shop voice / scénario débutant ===\n");

{
  const m1 =
    "Bonjour, je voudrais commencer la cigarette électronique mais je n’y connais absolument rien.";
  assert(isSocialGreeting(m1) === false, "E1 pas un simple bonjour");
  assert(detectClientIntent(m1, null) !== "SOCIAL_GREETING", "E1 intent non social");
  assert(matchQuickIntentFromMessage(m1) === "BEGINNER_VAPING", "E1 parcours débutant");
  assert(detectExperienceFromMessage(m1) === "BEGINNER", "E1 BEGINNER");
  const started = startQuickFlow("BEGINNER_VAPING", m1)!;
  assert(!/mtl|dl|ohm|watt|coil|chipset/i.test(started.content), "E1 pas de jargon");
  assert(!INTERNAL.test(started.content), "E1 pas d'interne");
  assert(started.content.length < 280, "E1 réponse courte");
}

{
  const a = beginnerNicotineOrientation({
    cigarettesPerDay: 20,
    allDayNeed: true,
    deviceKind: "pod",
  });
  const b = beginnerNicotineOrientation({
    cigarettesPerDay: 20,
    allDayNeed: true,
    deviceKind: "pod",
  });
  assert(String(a.recommendation.recommendedRange) === String(b.recommendation.recommendedRange), "stabilité fourchette");
  assert(a.recommendation.recommendedRange[0] === 15 && a.recommendation.recommendedRange.at(-1) === 18, "20 cigs → 15-18");
  assert(!INTERNAL.test(a.spoken), "nicotine spoken sans interne");
  assert(/15/.test(a.spoken) && /18/.test(a.spoken), "nicotine cite la fourchette moteur");
  assert(!/0 à 18|taux courants/i.test(a.spoken), "pas de récitation 0-18");
}

{
  const s0 = startQuickFlow("BEGINNER_VAPING")!;
  const s1 = continueQuickFlow(s0.state!, "Je fume environ 20 cigarettes par jour.");
  assert(!/combien de cigarettes/i.test(s1.content), "ne redemande pas 20 cigs");
  const s2 = continueQuickFlow(s1.state!, "Je fais des tubes.");
  const s3 = continueQuickFlow(s2.state!, "J'ai envie de fumer toute la journée.");
  const s4 = s3.continueFlow
    ? continueQuickFlow(
        s3.state!,
        "Je veux le meilleur matériel pour arrêter de fumer, mais je ne sais pas du tout quoi choisir.",
      )
    : s3;
  assert(!s4.continueFlow, "questionnaire interrompu");
  assert(s4.catalogHint?.category === "cigarettes-electroniques", "reco matériel");
  assert((s4.catalogHint?.limit ?? 99) <= 3, "max 3 modèles");
  assert(!INTERNAL.test(s4.content), "reco sans interne");
  assert(!/compact ou autonomie|fruité ou gourmand|mtl ou dl/i.test(s4.content), "pas de Q secondaires");
}

{
  const flavor = startFlavorOrientation();
  assert(/cigarette|différent/i.test(flavor.content), "liquide : 2 directions");
  const unsure = continueQuickFlow(flavor.state!, "Franchement je ne sais pas.");
  assert(/deux options/i.test(unsure.content), "prend la main si indécis");
  assert((unsure.catalogHint?.limit ?? 99) <= 2, "max 2 liquides");
}

{
  const gOk = presentDeviceGuide("XROS 3", "BEGINNER");
  assert(gOk.available === true, "guide XROS vérifié");
  assert(!/voulez-vous que je vous explique/i.test(gOk.spoken), "guide auto, pas de demande");
  const gBad = presentDeviceGuide("Modele Invente XYZ", "BEGINNER");
  assert(gBad.available === false, "pas de guide inventé");
  assert(/ne vais pas inventer/i.test(gBad.spoken), "fallback sûr");
}

{
  const expert = resolveExperienceLevel({
    profileStatus: "confirme",
    message: "Je cherche une nouvelle box plus puissante.",
  });
  assert(expert === "EXPERT", "expert reconnu");
  assert(shouldSkipBeginnerQuiz(expert, "Je cherche une nouvelle box plus puissante."), "pas de quiz débutant");
}

{
  const leaked =
    "Le tableau boutique All Vap's oriente souvent les gros fumeurs. Ce n'est pas un avis médical.";
  const clean = scrubClientReply(leaked);
  assert(!/tableau boutique/i.test(clean), "scrub table");
  assert(!/avis médical/i.test(clean), "scrub disclaimer");
}

assert(isSocialGreeting("Bonjour.") === true, "bonjour nu = social");
assert(isSocialGreeting("Bonjour je voudrais commencer la vape") === false, "bonjour + demande ≠ social");
assert(isDeviceRecommendationIntent("vous me conseillez quoi ?"), "variante conseillez quoi");
assert(isDeviceRecommendationIntent("je ne sais pas quoi prendre"), "variante sais pas quoi prendre");

console.log(`\nRésultat: ${ok} OK, ${fail} FAIL\n`);
if (fail > 0) process.exit(1);
