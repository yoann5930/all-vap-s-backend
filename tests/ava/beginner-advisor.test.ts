/**
 * AVA conseiller débutant / expert — tests 1–10
 * npx tsx tests/ava/beginner-advisor.test.ts
 */
import {
  startQuickFlow,
  continueQuickFlow,
  matchQuickIntentFromMessage,
} from "../../lib/ava/quick-flows";
import {
  isDeviceRecommendationIntent,
  parseCigarettesPerDay,
  parseCigarettesCorrection,
  detectAllDayNeed,
  beginnerHasEnoughForFirstDevice,
  shouldSkipBeginnerQuiz,
  containsForbiddenMemoryLanguage,
  containsInternalShopSpeak,
  beginnerForbiddenQuestion,
  resolveExperienceLevel,
  detectExperienceFromMessage,
  isFlavorTooEarly,
  isFlavorIndecision,
  isAskToPickRecommended,
  isNicotineStrengthQuestion,
  isConfirmRecommendedDevice,
} from "../../lib/ava/advisor-policy";
import { beginnerNicotineOrientation } from "../../lib/ava/beginner-nicotine-speak";
import { presentDeviceGuide } from "../../lib/ava/device-guide-present";
import { selectBeginnerDevicePool } from "../../lib/ava/device-recommendation";
import {
  applyCigarettesCorrection,
  memoryFromVapeProfile,
  emptyCustomerMemory,
} from "../../lib/ava/customer-memory";
import { decideAdvisorAction, advisorStateFromMemory } from "../../lib/ava/advisor-decision";
import { emptyVapeProfile } from "../../lib/vape-profile/types";
import type { AvaRankedProduct } from "../../lib/ai/ava/types";

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

console.log("\n=== AVA beginner advisor ===\n");

// TEST 1 — Débutant 20 cigs / toute la journée / meilleur matériel
{
  const s0 = startQuickFlow("BEGINNER_VAPING")!;
  const s1 = continueQuickFlow(s0.state!, "Oui, je fume encore");
  const s2 = continueQuickFlow(
    s1.state!,
    "Je fume environ 20 tubes par jour et j'en ai besoin toute la journée.",
  );
  const s3 = s2.continueFlow
    ? continueQuickFlow(s2.state!, "Je veux le meilleur matériel pour arrêter de fumer.")
    : s2;
  assert(!s3.continueFlow, "T1 première reco sans questionnaire interminable");
  assert(Boolean(s3.catalogHint?.category === "cigarettes-electroniques"), "T1 catalogue matériel");
  assert((s3.catalogHint?.limit ?? 99) <= 3, "T1 max 3 produits");
  assert(!/taux courants|0 à 18|0 a 18/i.test(s3.content), "T1 pas de fourchette générique 0-18");
  assert(!beginnerForbiddenQuestion(s3.content), "T1 pas de jargon MTL/puissance");
  assert(/mg\/ml/i.test(s3.content), "T1 nicotine via moteur métier");
  assert(!/table boutique|tableau boutique/i.test(s3.content), "T1 pas d'exposition table interne");
  assert(!/sans puff ni jetable/i.test(s3.content), "T1 pas de puff non demandée");
  assert(!/avis médical/i.test(s3.content), "T1 pas de disclaimer médical");
  assert(!/compact ou|fruité, frais, gourmand/i.test(s3.content), "T1 pas compact/saveurs trop tôt");
}

{
  const nic = beginnerNicotineOrientation({
    cigarettesPerDay: 20,
    allDayNeed: true,
    deviceKind: "pod",
  });
  assert(nic.recommendation.recommendedRange.length > 0, "T1 moteur nicotine a une plage");
  assert(!/les taux courants/i.test(nic.spoken), "T1 spoken non générique");
  assert(!/table boutique|tableau boutique|avis médical/i.test(nic.spoken), "T1 spoken sans interne");
  assert(nic.recommendation.recommendedRange[0] === 15, "T1 20 cigs pod → 15 mg bas de fourchette");
  assert(nic.recommendation.recommendedRange[nic.recommendation.recommendedRange.length - 1] === 18, "T1 20 cigs pod → 18 mg haut");
}

// TEST 2 — Interruption
{
  const s0 = startQuickFlow("BEGINNER_VAPING")!;
  const s1 = continueQuickFlow(s0.state!, "Oui je fume encore");
  const s2 = continueQuickFlow(s1.state!, "Environ 20");
  assert(isDeviceRecommendationIntent("Choisis-moi directement le matériel le plus adapté."), "T2 intent");
  const s3 = continueQuickFlow(
    s2.state!,
    "Choisis-moi directement le matériel le plus adapté.",
  );
  assert(!s3.continueFlow, "T2 arrêt questions secondaires");
  assert(s3.catalogHint?.category === "cigarettes-electroniques", "T2 reco matériel");
}

// TEST 3 — Client connu
{
  const profile = {
    ...emptyVapeProfile(),
    status: "debutant" as const,
    cigarettesPerDay: 20,
    usedNicotineMg: 12,
    advisedProductIds: ["kit-1"],
    gdprConsent: true,
  };
  const mem = memoryFromVapeProfile(profile, "Julien");
  assert(mem.firstName === "Julien", "T3 prénom");
  assert(mem.currentDeviceName == null && mem.recommendedProductIds.includes("kit-1"), "T3 matériel recommandé");
  assert(mem.usedNicotineMg === 12, "T3 nicotine connue");
  const greet = `Bonjour ${mem.firstName}, contente de vous retrouver ! Comment ça se passe avec votre cigarette électronique ?`;
  assert(!containsForbiddenMemoryLanguage(greet), "T3 pas de « dossier »");
  const action = decideAdvisorAction(
    advisorStateFromMemory(mem, "bonjour"),
    "bonjour",
  );
  assert(action !== "ASK_SMOKES", "T3 pas de quiz tabagique au rebonjour");
}

// TEST 4 — Correction 20 → 8
{
  const before = emptyCustomerMemory({ cigarettesPerDay: 20, experienceLevel: "BEGINNER" });
  const after = applyCigarettesCorrection(
    before,
    parseCigarettesCorrection("Maintenant je ne fume plus que 8 cigarettes par jour.")!,
  );
  assert(after.cigarettesPerDay === 8, "T4 nouvelle valeur 8");
  assert(after.cigarettesPerDayPrevious === 20, "T4 ancienne conservée en historique");
  assert(after.cigarettesPerDay !== 20, "T4 20 n'est plus courant");
}

// TEST 5 — Expert 3 mg
{
  const level = resolveExperienceLevel({
    profileStatus: "confirme",
    message: "Je cherche un kit un peu plus puissant",
  });
  assert(level === "EXPERT", "T5 niveau EXPERT");
  assert(shouldSkipBeginnerQuiz(level, "Je cherche un kit puissant"), "T5 skip quiz débutant");
  assert(matchQuickIntentFromMessage("Je débute") === "BEGINNER_VAPING", "T5 je débute reste possible");
  const mem = emptyCustomerMemory({
    experienceLevel: "EXPERT",
    usedNicotineMg: 3,
  });
  assert(mem.usedNicotineMg === 3, "T5 taux mémorisé 3 mg");
  const act = decideAdvisorAction(advisorStateFromMemory(mem, "kit puissant"), "kit puissant");
  assert(act === "FREE_EXPERT", "T5 navigation libre");
}

// TEST 6 — Guide débutant XROS 3 (notice vérifiée)
{
  const g = presentDeviceGuide("XROS 3", "BEGINNER");
  assert(g.available === true, "T6 guide disponible");
  assert(g.sections.some((s) => s.id === "fill" || s.id === "power"), "T6 remplissage/allumage");
  assert(g.sections.some((s) => s.id === "charging" || s.id === "coil"), "T6 recharge ou pod");
  assert(!/besoin d'aide/i.test(g.spoken), "T6 pas de bouton d'aide");
}

// TEST 7 — Guide expert plus concis
{
  const b = presentDeviceGuide("XROS 3", "BEGINNER");
  const e = presentDeviceGuide("XROS 3", "EXPERT");
  assert(e.available && b.available, "T7 les deux ont le guide");
  const bFill = b.sections.find((s) => s.id === "fill")?.lines.length ?? 0;
  const eFill = e.sections.find((s) => s.id === "fill")?.lines.length ?? 0;
  assert(eFill <= bFill, "T7 expert ≤ débutant en détail remplissage");
  assert(!/ce qu'est une résistance/i.test(e.spoken), "T7 pas de cours débutant");
}

// TEST 8 — Matériel sans guide validé
{
  const g = presentDeviceGuide("Modele Invente XYZ 999", "BEGINNER");
  assert(g.available === false, "T8 pas de guide inventé");
  assert(g.sections.length === 0, "T8 aucune procédure");
  assert(/ne vais pas inventer|vérifi/i.test(g.spoken), "T8 fallback sûr");
}

// TEST 9 — Stock : principale en stock
{
  const ranked: AvaRankedProduct[] = [
    {
      product: {
        id: "oos",
        name: "Pod Rupture",
        slug: "pod-rupture",
        description: null,
        shortDescription: null,
        category: "cigarettes-electroniques",
        brand: "Test",
        manufacturerName: "Test",
        range: null,
        productType: "pod",
        priceCents: 2990,
        promoPriceCents: null,
        isPromo: false,
        isNew: false,
        stock: 0,
        availableQuantity: 0,
        stockKnown: true,
        imageUrl: "/x.webp",
        isActive: true,
        visibleOnline: true,
        catalogStatus: "publie",
        volumeMl: null,
        primaryFlavor: null,
        secondaryFlavor: null,
        flavorFamily: null,
        flavors: [],
        searchKeywords: null,
        isFresh: null,
        isFruity: null,
        isGourmet: null,
        isTobacco: null,
        isMint: null,
        isDrink: null,
        flavorValidated: false,
        avaKeywords: null,
        avaSaveurs: null,
        avaDescription: null,
        variants: [],
      },
      score: 90,
      matchedVariant: { id: "v1", name: "std", nicotineMg: null, nicotineLabel: null, capacityMl: null, stock: 0, priceCents: 2990, active: true, pgVgLabel: null },
      reason: "score",
      needsVerification: false,
      outOfStockExact: true,
    },
    {
      product: {
        id: "ok",
        name: "Pod Dispo",
        slug: "pod-dispo",
        description: null,
        shortDescription: null,
        category: "cigarettes-electroniques",
        brand: "Test",
        manufacturerName: "Test",
        range: null,
        productType: "pod",
        priceCents: 2490,
        promoPriceCents: null,
        isPromo: false,
        isNew: false,
        stock: 4,
        availableQuantity: 4,
        stockKnown: true,
        imageUrl: "/y.webp",
        isActive: true,
        visibleOnline: true,
        catalogStatus: "publie",
        volumeMl: null,
        primaryFlavor: null,
        secondaryFlavor: null,
        flavorFamily: null,
        flavors: [],
        searchKeywords: null,
        isFresh: null,
        isFruity: null,
        isGourmet: null,
        isTobacco: null,
        isMint: null,
        isDrink: null,
        flavorValidated: false,
        avaKeywords: null,
        avaSaveurs: null,
        avaDescription: null,
        variants: [],
      },
      score: 80,
      matchedVariant: { id: "v2", name: "std", nicotineMg: null, nicotineLabel: null, capacityMl: null, stock: 4, priceCents: 2490, active: true, pgVgLabel: null },
      reason: "score",
      needsVerification: false,
      outOfStockExact: false,
    },
  ];
  const pool = selectBeginnerDevicePool(ranked, 3);
  assert(pool.primaryInStock === true, "T9 principale en stock");
  assert(pool.products[0]?.id === "ok", "T9 pas de rupture en reco principale");
}

// TEST 10 — Mémoire entre sessions (profil → mémoire)
{
  const session1 = emptyCustomerMemory({
    experienceLevel: "BEGINNER",
    cigarettesPerDay: 20,
    usedNicotineMg: 12,
    selectedDeviceName: "XROS 3",
  });
  const asProfile = {
    ...emptyVapeProfile(),
    status: "debutant" as const,
    cigarettesPerDay: session1.cigarettesPerDay,
    usedNicotineMg: session1.usedNicotineMg,
    advisedProductIds: ["xros"],
    gdprConsent: true,
  };
  const session2 = memoryFromVapeProfile(asProfile, "Julien");
  assert(session2.cigarettesPerDay === 20, "T10 cigs restaurés");
  assert(session2.usedNicotineMg === 12, "T10 nicotine restaurée");
  assert(session2.firstName === "Julien", "T10 prénom restauré");
}

assert(parseCigarettesPerDay("Environ 20") === 20, "parse environ 20");
assert(parseCigarettesPerDay("Je fume 20 clopes.") === 20, "parse 20 clopes");
assert(parseCigarettesPerDay("Je suis à un paquet par jour.") === 20, "parse paquet");
assert(parseCigarettesPerDay("Environ vingt.") === 20, "parse environ vingt");
assert(parseCigarettesPerDay("Ça dépend, mais autour de 20.") === 20, "parse autour de 20");
assert(detectAllDayNeed("toute la journée") === true, "detect all-day");
assert(beginnerHasEnoughForFirstDevice({ cigsPerDay: "20", allDay: "yes" }), "enough for device");
assert(!containsForbiddenMemoryLanguage("Bonjour Julien, contente de vous retrouver !"), "langage naturel");
assert(detectExperienceFromMessage("je n'y connais absolument rien") === "BEGINNER", "BEGINNER n'y connais rien");
assert(
  matchQuickIntentFromMessage(
    "Bonjour, je voudrais commencer la cigarette électronique mais je n'y connais absolument rien.",
  ) === "BEGINNER_VAPING",
  "premier contact → parcours débutant",
);
assert(isDeviceRecommendationIntent("Peu importe, je vous fais confiance, choisissez pour moi."), "confiance → reco");
assert(isDeviceRecommendationIntent("Mais lequel vous me conseillez vraiment ?"), "trancher → reco");
assert(isAskToPickRecommended("Mais lequel vous me conseillez vraiment ?"), "ask pick");
assert(isConfirmRecommendedDevice("D'accord, je prends celui que vous me conseillez."), "confirm device");
assert(isNicotineStrengthQuestion("Et je dois prendre combien en nicotine ? Je n'y connais rien."), "nicotine Q");
assert(isFlavorTooEarly("Pour le liquide je ne sais pas du tout ce que j'aime."), "liquide indécis");
assert(isFlavorIndecision("Franchement je ne sais pas."), "franchement indécis");
assert(!containsInternalShopSpeak("Avec votre consommation, je partirais autour de 15 à 18 mg/ml pour commencer."), "phrase boutique propre");

{
  const s0 = startQuickFlow(
    "BEGINNER_VAPING",
    "Bonjour, je voudrais commencer la cigarette électronique mais je n'y connais absolument rien.",
  )!;
  assert(!/mtl|watt|résistance|coil/i.test(s0.content), "E1 pas de jargon");
  const s1 = continueQuickFlow(s0.state!, "Je fume environ 20 cigarettes par jour.");
  assert(!/combien de cigarettes/i.test(s1.content), "E2 ne redemande pas le nombre");
  assert(s1.continueFlow === true, "E2 encore une question utile");
  const sTubes = continueQuickFlow(s1.state!, "Je fais des tubes.");
  assert(sTubes.continueFlow === true, "E3 tubes ne déclenche pas la reco trop tôt");
  const s4 = continueQuickFlow(sTubes.state!, "J'ai envie de fumer toute la journée.");
  const s5 = s4.continueFlow
    ? continueQuickFlow(
        s4.state!,
        "Je veux le meilleur matériel pour arrêter de fumer, mais je ne sais pas du tout quoi choisir.",
      )
    : s4;
  assert(!s5.continueFlow, "E5 reco après infos suffisantes");
  assert(s5.catalogHint?.category === "cigarettes-electroniques", "E5 catalogue matériel");
  assert(!containsInternalShopSpeak(s5.content), "E5 sans fuite interne");
  assert(!/sans puff/i.test(s5.content), "E5 pas de puff");
  assert((s5.content.match(/[.!?]/g) || []).length <= 8, "E5 réponse courte");
}

console.log(`\nRésultat: ${ok} OK, ${fail} FAIL\n`);
if (fail > 0) process.exit(1);
