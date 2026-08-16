import type { NicotineType } from "./config";
import { NICOTINE_CONFIG } from "./config";
import type { CravingLevel, MixInput, NicotineProfileInput, ThroatHit } from "./types";

const NORM = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function isNicotineConversation(message: string): boolean {
  const n = NORM(message);
  if (!n) return false;
  if (/\b(fraise|menthe|fruit|gourmand|catalogue|en stock|disponible)\b/.test(n) && !/\bnicotine|booster|taux|sels?\b/.test(n)) {
    return false;
  }
  return (
    /taux de nicotine|choisir.*nicotine|nicotine choisir/.test(n) ||
    /sels? de nicotine|nicotine classique|freebase|libre ?base/.test(n) ||
    /calcul(er)? (la )?nicotine|combien de booster/.test(n) ||
    /booster/.test(n) && /\b(50\s*ml|10\s*ml|mg)\b/.test(n) ||
    /\b\d+\s*mg\b/.test(n) && /(ne (me )?suffit pas|trop (fort|faible)|arrache|gorge|manque|envie de fumer)/.test(n) ||
    /je ne fume pas/.test(n) && /nicotine|\d+\s*mg/.test(n) ||
    /(nausee|nausée|vertige|palpitation|malaise|maux de tete)/.test(n) && /nicotine|\d+\s*mg|vape/.test(n) ||
    /combien (je|on) (vais|va) vapoter|consommation (estimee|par jour|mensuelle|de liquide)|bouffees? par jour/.test(n) ||
    /difference.*(sels?|classique)|sels?.*(ou|et|vs).*classique|c est quoi (les )?sels/.test(n)
  );
}

export function parseMixRequest(message: string): MixInput | null {
  const n = NORM(message);
  if (!/booster/.test(n)) return null;

  const mlValues = [...n.matchAll(/(\d+(?:[.,]\d+)?)\s*ml/g)].map((m) =>
    parseFloat(m[1]!.replace(",", "."))
  );
  const baseVolumeMl =
    firstNumber(n.match(/base\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*ml/)) ??
    mlValues[0] ??
    NICOTINE_CONFIG.allvapsCommercial50ml.baseVolumeMl;
  const count =
    firstInt(n.match(/(\d+)\s*boosters?/)) ??
    (/un booster|\+ 1 booster|1 booster/.test(n) ? 1 : null);
  const boosterVol =
    firstNumber(n.match(/booster[s]?[^\d]{0,12}(\d+(?:[.,]\d+)?)\s*ml/)) ??
    (mlValues[1] && mlValues[1] !== baseVolumeMl ? mlValues[1] : null) ??
    NICOTINE_CONFIG.allvapsCommercial50ml.boosterVolumeMl;
  const strength =
    firstNumber(n.match(/(\d+(?:[.,]\d+)?)\s*mg(?:\s*\/\s*ml)?/)) ??
    NICOTINE_CONFIG.allvapsCommercial50ml.boosterStrengthMgMl;
  const type: NicotineType = /sel/.test(n) ? "SALT" : "FREEBASE";

  if (count == null) return null;
  return {
    baseVolumeMl,
    boosterVolumeMl: boosterVol,
    boosterStrengthMgMl: strength,
    boosterCount: count,
    nicotineType: type,
  };
}

export function extractProfileHints(message: string): Partial<NicotineProfileInput> {
  const n = NORM(message);
  const out: Partial<NicotineProfileInput> = {};

  if (/je ne fume pas|je n ai jamais fume|non fumeur|non-fumeur/.test(n)) {
    out.smoker = false;
    out.vaper = /je vapot|je suis vapot/.test(n);
  } else if (/je fume|fumeur|cigarettes? par jour/.test(n)) {
    out.smoker = true;
  }

  const cigs = firstInt(n.match(/(\d+)\s*cigarettes?/));
  if (cigs != null) {
    out.cigarettesPerDay = cigs;
    out.smoker = true;
  }

  if (/moins de 5 min|moins de cinq min|des le reveil|au reveil tout de suite/.test(n)) {
    out.firstCigaretteAfterWakeMinutes = 3;
  } else if (/5 a 30|5 à 30|cinq a trente/.test(n)) {
    out.firstCigaretteAfterWakeMinutes = 15;
  } else if (/30 a 60|30 à 60/.test(n)) {
    out.firstCigaretteAfterWakeMinutes = 45;
  } else if (/plus d une heure|plus de 60/.test(n)) {
    out.firstCigaretteAfterWakeMinutes = 90;
  }

  if (/sel/.test(n)) out.currentNicotineType = "SALT";
  else if (/classique|freebase|libre ?base/.test(n)) out.currentNicotineType = "FREEBASE";

  const mg = firstNumber(n.match(/(\d+(?:[.,]\d+)?)\s*mg/));
  if (mg != null && !/booster/.test(n) && !/essayer|voudrais/.test(n)) {
    out.currentNicotineMg = mg;
    out.vaper = true;
  }

  if (/nausee|nausée|vertige|palpitation|malaise|maux de tete|surdosage/.test(n)) {
    out.symptoms = ["nausées"];
  }

  if (/plus envie de fumer|plus envie de cigarette|manque (est )?(controle|sous controle)|je n ai plus envie/.test(n)) {
    out.cravings = "NONE";
    out.tobaccoReplaced = true;
  } else if (/encore envie|manque|ne (me )?suffit pas|toujours fumer/.test(n)) {
    out.cravings = "HIGH";
  }

  if (/arrache|trop (agressif|forte?|fort) en gorge|me brule la gorge/.test(n)) {
    out.throatHit = "TOO_STRONG";
  } else if (/hit me convient|gorge me va|hit agreable|me convient/.test(n)) {
    out.throatHit = "GOOD";
  }

  if (/vapote(r)? (tres )?souvent|compenser/.test(n)) {
    out.vapingFrequency = "high";
  }

  if (/pod|aio/.test(n)) out.deviceType = "pod";
  else if (/box|mod|subohm|sub-ohm/.test(n)) out.deviceType = n.match(/box|mod|subohm|sub-ohm/)?.[0];
  const watts = firstNumber(n.match(/(\d+(?:[.,]\d+)?)\s*w(?:atts?)?/));
  if (watts != null) out.powerWatts = watts;
  const ohm = firstNumber(n.match(/(\d+(?:[.,]\d+)?)\s*(?:ohm|Ω)/));
  if (ohm != null) out.resistanceOhm = ohm;
  if (/mtl|tirage serre/.test(n)) out.inhalationType = "mtl";
  if (/dl|direct lung|inhalation directe/.test(n)) out.inhalationType = "dl";

  if (/majeur|18 ans|adulte/.test(n)) out.adult = true;
  if (/je veux baisser|reduire/.test(n)) out.wantsReduction = true;

  return out;
}

export function parseCravingAnswer(message: string): CravingLevel | undefined {
  const n = NORM(message);
  if (/plus|non|aucun|controle|sous controle/.test(n) && !/encore|toujours/.test(n)) return "NONE";
  if (/un peu|faible|leger/.test(n)) return "LOW";
  if (/moyen|parfois/.test(n)) return "MEDIUM";
  if (/oui|beaucoup|fort|encore|manque/.test(n)) return "HIGH";
  return undefined;
}

export function parseThroatAnswer(message: string): ThroatHit | undefined {
  const n = NORM(message);
  if (/arrache|trop|agressif|brule|oui/.test(n)) return "TOO_STRONG";
  if (/trop doux|pas assez|mou/.test(n)) return "TOO_SOFT";
  if (/va|convient|bien|non|correct/.test(n)) return "GOOD";
  return undefined;
}

export function parseWakeDelay(message: string): number | undefined {
  const n = NORM(message);
  if (/moins de 5|moins de cinq|< ?5/.test(n)) return 3;
  if (/5 a 30|5 à 30/.test(n)) return 15;
  if (/30 a 60|30 à 60/.test(n)) return 45;
  if (/plus d une heure|plus de 60|> ?60/.test(n)) return 90;
  return undefined;
}

function firstNumber(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  const v = parseFloat(match[1]!.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function firstInt(match: RegExpMatchArray | null): number | null {
  const v = firstNumber(match);
  return v == null ? null : Math.round(v);
}
