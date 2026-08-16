/**
 * Module nicotine All Vap's — tests A–K
 * npx tsx tests/nicotine/nicotine-module.test.ts
 */
import {
  mixNicotine,
  roundMgMl,
  recommendNicotineProfile,
  evaluateRequestedStrength,
  NICOTINE_CONFIG,
  continueNicotineDialogue,
  lookupConsumptionEstimate,
  lookupSmokerProfile,
  spokenTypeComparison,
  spokenConsumption,
} from "../../lib/nicotine";

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

console.log("\n=== Module nicotine All Vap's ===\n");

assert(NICOTINE_CONFIG.freebase.maxMgMl === 15, "limite freebase = 15");
assert(NICOTINE_CONFIG.salts.maxMgMl === 20, "limite sels = 20");
assert(NICOTINE_CONFIG.freebase.allowedTargets.join(",") === "3,6,9,12,15", "grille freebase");
assert(NICOTINE_CONFIG.salts.allowedTargets.join(",") === "3,6,9,12,15,18,20", "grille sels");

{
  const r = mixNicotine({
    baseVolumeMl: 50,
    boosterVolumeMl: 10,
    boosterStrengthMgMl: 20,
    boosterCount: 1,
    nicotineType: "FREEBASE",
  });
  assert(r.totalNicotineMg === 200, "A nicotine totale 200 mg");
  assert(r.finalVolumeMl === 60, "A volume final 60 ml");
  assert(roundMgMl(r.actualMgMl) === 3.33, "A taux réel ≈ 3.33");
  assert(r.commercialTargetMgMl === 3, "A cible commerciale 3");
  assert(r.alert === null, "A pas d'alerte");
}

{
  const r = mixNicotine({
    baseVolumeMl: 50,
    boosterVolumeMl: 10,
    boosterStrengthMgMl: 20,
    boosterCount: 2,
    nicotineType: "FREEBASE",
  });
  assert(roundMgMl(r.actualMgMl) === 5.71, "B taux réel ≈ 5.71");
  assert(r.commercialTargetMgMl === 6, "B cible commerciale 6");
}

{
  const r = evaluateRequestedStrength("FREEBASE", 15);
  assert(r.status === "OK", "C classique 15 autorisé");
}

{
  const r = evaluateRequestedStrength("FREEBASE", 18);
  assert(r.status === "BLOCKED_OVER_LIMIT", "D classique > 15 bloqué");
  assert(/15/.test(r.spoken), "D mentionne le plafond 15");
}

{
  const r = evaluateRequestedStrength("SALT", 20, {
    deviceType: "pod",
    powerWatts: 12,
    inhalationType: "mtl",
  });
  assert(r.status === "OK", "E sels 20 autorisé si matériel adapté");
}

{
  const r = evaluateRequestedStrength("SALT", 24);
  assert(r.status === "BLOCKED_OVER_LIMIT", "F sels > 20 bloqué");
}

{
  const r = recommendNicotineProfile({ adult: true, smoker: false });
  assert(r.status === "BLOCKED_NON_SMOKER", "G non-fumeur : aucune reco nicotine");
  assert(/je ne vais pas vous orienter vers un produit nicotiné/i.test(r.spoken), "G phrase type");
}

{
  const r = recommendNicotineProfile({
    adult: true,
    smoker: true,
    currentNicotineMg: 6,
    currentNicotineType: "FREEBASE",
    cravings: "NONE",
    throatHit: "GOOD",
    tobaccoReplaced: true,
  });
  assert(r.status === "KEEP_CURRENT", "H manque contrôlé + hit OK → on ne change pas");
  assert(r.recommendedType === "FREEBASE", "H reste classique");
  assert(!/passez aux sels|vous devez/.test(r.spoken.toLowerCase()), "H n'impose pas les sels");
}

{
  const r = recommendNicotineProfile({
    adult: true,
    smoker: true,
    cigarettesPerDay: 15,
    currentNicotineMg: 9,
    currentNicotineType: "FREEBASE",
    cravings: "HIGH",
    throatHit: "TOO_STRONG",
    deviceType: "pod",
    powerWatts: 15,
    inhalationType: "mtl",
  });
  assert(
    r.status === "CONSIDER_SALT" || r.status === "BLOCKED_PENDING_DEVICE_INFO",
    "I manque + freebase agressive → évaluation sels"
  );
  assert(/sels de nicotine peuvent être une option à envisager/i.test(r.spoken), "I formulation sans obligation");
  assert(!/vous devez passer aux sels/i.test(r.spoken), "I pas d'injonction");
}

{
  const r = evaluateRequestedStrength("SALT", 20, {});
  assert(r.status === "BLOCKED_PENDING_DEVICE_INFO", "J sel 20 + matériel inconnu");
  assert(r.questionsNeeded.length > 0, "J demande le matériel");
}

{
  const r = recommendNicotineProfile({
    adult: true,
    smoker: true,
    currentNicotineMg: 12,
    currentNicotineType: "FREEBASE",
    cravings: "LOW",
    throatHit: "GOOD",
    symptoms: ["nausées", "vertiges"],
  });
  assert(r.status === "REDUCE_OR_PAUSE", "K symptômes d'excès → pas d'augmentation");
  assert(!/augmentez votre nicotine/i.test(r.spoken), "K n'invite pas à augmenter");
}

{
  const six = mixNicotine({
    baseVolumeMl: 50,
    boosterVolumeMl: 10,
    boosterStrengthMgMl: 20,
    boosterCount: 6,
    nicotineType: "FREEBASE",
  });
  assert(six.freebaseBoosterCapExceeded, "6 boosters interdits en workflow 50 ml classique");
  assert(six.alert !== null, "alerte 6 boosters");
}

{
  const turn = continueNicotineDialogue(null, "Je fume 20 cigarettes par jour et le 6 mg ne me suffit pas");
  assert(/manque|agressif|gorge/i.test(turn.spoken), "conversation : relance manque vs gorge");
}

{
  const cmp = continueNicotineDialogue(null, "Quelle est la différence entre sels et nicotine classique ?");
  assert(/plus marqué|plus doux/i.test(cmp.spoken), "dialogue comparaison sels / classique");
  assert(/ne promets pas une vitesse d'absorption précise/i.test(cmp.spoken), "dialogue sans promesse absorption");
  const conso = continueNicotineDialogue(null, "Combien je vais vapoter à 6 mg ?");
  assert(/3 à 5 ml/i.test(conso.spoken), "dialogue conso 6 mg");
}

{
  const row = lookupConsumptionEstimate(6);
  assert(row?.mlPerDay === "3 à 5 ml", "table conso 6 mg");
  assert(row?.mlPerMonth === "~120 ml", "table conso mensuelle 6 mg");
  const heavy = lookupSmokerProfile(25);
  assert(heavy?.id === "gros_fumeur", "20+ = gros fumeur");
  assert(heavy?.rangeMgMl.join(",") === "15,18", "gros fumeur grille 15-18, pas 16");
  assert(!(heavy?.types as readonly string[]).includes("FREEBASE"), "gros fumeur : sels uniquement");
  const spoken = spokenTypeComparison();
  assert(/hit plus marqué|plus doux/i.test(spoken), "comparaison hit boutique");
  assert(/ne promets pas une vitesse d'absorption précise/i.test(spoken), "pas de promesse d'absorption exacte");
  assert(!/absorption rapide/i.test(spoken), "ne dit pas absorption rapide");
  assert(/indicatif|fourchette boutique/i.test(spokenConsumption(12)), "conso 12 mg indicatif");
}

{
  const r = recommendNicotineProfile({
    adult: true,
    smoker: true,
    cigarettesPerDay: 25,
    cravings: "HIGH",
    throatHit: "GOOD",
    currentNicotineType: "FREEBASE",
  });
  assert(!r.recommendedRange.includes(16), "jamais de SKU 16 mg");
  assert(r.recommendedRange.every((n) => n <= 15), "classique plafonnée à 15");
  assert(/sels/i.test(r.spoken), "gros fumeur : mention sels");
  assert(!/vous devez passer aux sels/i.test(r.spoken), "gros fumeur : pas d'injonction");
}

console.log(`\n${ok} ok, ${fail} fail\n`);
if (fail > 0) process.exit(1);
