/**
 * Politique conseiller AVA — débutant / expert.
 * Une intention explicite interrompt les questions secondaires.
 * Pas de jargon technique pour un débutant. Pas de « dossier client ».
 */
export type AvaExperienceLevel = "BEGINNER" | "GUIDED" | "AUTONOMOUS" | "EXPERT";

export function normAdvisor(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDeviceRecommendationIntent(message: string): boolean {
  const t = normAdvisor(message);
  return (
    /choisis[- ]moi|choisissez[- ]moi|choisissez pour moi|le meilleur materiel|materiel pour (debuter|arreter)|arreter de fumer|arreter les cigarettes|qu est[- ]ce que je dois (prendre|acheter)|conseille[- ]moi( une)? (cigarette|materiel)?|montre[- ]moi (les )?modeles|je veux (le meilleur|un materiel|quelque chose d adapte|quelque chose de bien)|directement le materiel|je (ne )?sais pas (du tout )?quoi (prendre|choisir)|prenez le meilleur|vous me conseillez (quoi|lequel)|lequel .{0,32}(conseillez|recommandez)|peu importe.{0,40}(confiance|choisis)/.test(
      t,
    ) ||
    (/cigarette electronique/.test(t) && /(meilleur|debuter|conseille|choisis)/.test(t))
  );
}

export function isAskToPickRecommended(message: string): boolean {
  const t = normAdvisor(message);
  return /lequel .{0,32}(conseillez|recommandez)|vous me conseillez (vraiment )?(lequel|quoi)|mais lequel|lequel (je|on) (prends|prend|choisit)/.test(
    t,
  );
}

export function isConfirmRecommendedDevice(message: string): boolean {
  const t = normAdvisor(message);
  return /je prends (celui|ca|le (modele|materiel))|d accord.{0,24}je prends|ok je prends|je le prends|celui que vous (me )?(conseillez|recommandez)/.test(
    t,
  );
}

export function isNicotineStrengthQuestion(message: string): boolean {
  const t = normAdvisor(message);
  return /combien .{0,28}nicotine|quel taux|quelle nicotine|taux .{0,16}prendre|je dois prendre combien|combien (en |de )?nicotine/.test(
    t,
  );
}

export function isFlavorTooEarly(message: string): boolean {
  const t = normAdvisor(message);
  return (
    /je (ne )?sais pas (quelle|quoi) saveur|quelle saveur/.test(t) ||
    /pour le liquide.{0,80}(sais pas|connais pas|ce que j aime)/.test(t) ||
    /liquide.{0,40}je (ne )?sais pas/.test(t)
  );
}

export function isFlavorIndecision(message: string): boolean {
  const t = normAdvisor(message);
  return /franchement je (ne )?sais pas|aucune idee|pas d avis|je n ai pas de preference|^je (ne )?sais pas\.?$/.test(
    t,
  );
}

export function parseCigarettesPerDay(message: string): number | null {
  const t = normAdvisor(message);
  const plus = t.match(/plus de (\d{1,2})/);
  if (plus) return Number(plus[1]) + 1;
  const m = t.match(/(\d{1,2})\s*(cigarettes?|clopes?|tubes?)/);
  if (m) return Number(m[1]);
  if (/moins de 5|moins de cinq/.test(t)) return 4;
  if (/environ 10|une dizaine/.test(t)) return 10;
  if (/environ 20|une vingtaine|un paquet|paquet par jour/.test(t)) return 20;
  if (/plus de 20/.test(t)) return 25;
  const autour = t.match(/autour de (\d{1,2})/);
  if (autour) return Number(autour[1]);
  const environNum = t.match(/environ (\d{1,2})\b/);
  if (environNum) return Number(environNum[1]);
  if (/\bvingt\b/.test(t) && !/\d{2,}/.test(t)) return 20;
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= 60) return n;
  }
  const lone = t.match(/\b(\d{1,2})\b/);
  if (lone && Number(lone[1]) >= 1 && Number(lone[1]) <= 60 && /jour|\/j/.test(t)) {
    return Number(lone[1]);
  }
  return null;
}

export function parseCigarettesCorrection(message: string): number | null {
  const t = normAdvisor(message);
  const now = t.match(/maintenant .{0,48}?(?:fume|en fume)\s*(?:plus que |que )?(\d{1,2})/);
  if (now) return Number(now[1]);
  const plusQue = t.match(/(?:ne fume plus que|plus que|en fume (?:plus )?que)\s*(\d{1,2})/);
  if (plusQue) return Number(plusQue[1]);
  if (
    !/(ne fume plus|maintenant .{0,48}(fume|cigarette|tube|clope)|en fume (plus )?que)/.test(t)
  ) {
    return null;
  }
  const nums = [...t.matchAll(/(\d{1,2})\s*(cigarettes?|clopes?|tubes?)?/g)];
  if (nums.length >= 2) return Number(nums[nums.length - 1]![1]);
  return parseCigarettesPerDay(t);
}

export type NicotineFeedback = "TOO_STRONG" | "TOO_WEAK" | "OK" | "USAGE_UP" | null;

export function detectNicotineFeedback(message: string): NicotineFeedback {
  const t = normAdvisor(message);
  if (/trop fort|trop dose|arrache|me pique|trop de nicotine/.test(t)) return "TOO_STRONG";
  if (/encore envie de fumer|manque( de nicotine)?|trop faible|pas assez/.test(t)) return "TOO_WEAK";
  if (/vape (beaucoup )?plus (que prevu|que d habitude)|je vape trop/.test(t)) return "USAGE_UP";
  if (/ca (me )?convient|c est bien|ca va (bien|nickel)|parfait pour moi/.test(t)) return "OK";
  return null;
}

export function isPurchaseOrBeginnerCounsel(message: string): boolean {
  if (isDeviceRecommendationIntent(message)) return true;
  const t = normAdvisor(message);
  if (
    /je debut|debutant|premiere (vape|fois)|arreter de fumer|arreter les cigarettes|n y connais|commencer la cigarette/.test(
      t,
    )
  ) {
    return true;
  }
  if (parseCigarettesPerDay(message) != null) return true;
  if (detectAllDayNeed(message) != null) return true;
  return false;
}

export function hasHardwareProblemSignal(message: string): boolean {
  const t = normAdvisor(message);
  return /fuit|check atomizer|ne s allume|panne|\bsav\b|gout brule|erreur|ne marche plus|garantie/.test(
    t,
  );
}

export function shouldSkipBeginnerQuiz(
  level: AvaExperienceLevel,
  message: string,
): boolean {
  if (level !== "EXPERT" && level !== "AUTONOMOUS") return false;
  return !/je debut|debutant|premiere vape|jamais vape/.test(normAdvisor(message));
}

export function resolveExperienceLevel(opts: {
  profileStatus?: string | null;
  message?: string;
  previous?: AvaExperienceLevel | null;
}): AvaExperienceLevel {
  const fromMsg = opts.message
    ? detectExperienceFromMessage(opts.message, opts.previous)
    : opts.previous || null;
  if (opts.message && /je debut|debutant|jamais vape/.test(normAdvisor(opts.message))) {
    return "BEGINNER";
  }
  if (fromMsg === "EXPERT" || fromMsg === "AUTONOMOUS" || fromMsg === "GUIDED") return fromMsg;
  return levelFromVapeStatus(opts.profileStatus) || fromMsg || "BEGINNER";
}

export function logAdvisorDecision(payload: {
  experienceLevel: AvaExperienceLevel;
  intent: string;
  missingRequiredFields: string[];
  action: string;
  nicotineEngine: string;
  memoryLoaded: boolean;
}): void {
  console.info(
    "[ava-advisor]",
    `experienceLevel=${payload.experienceLevel}`,
    `intent=${payload.intent}`,
    `missingRequiredFields=[${payload.missingRequiredFields.join(",")}]`,
    `action=${payload.action}`,
    `nicotineEngine=${payload.nicotineEngine}`,
    `memoryLoaded=${payload.memoryLoaded}`,
  );
}

export function detectAllDayNeed(message: string): boolean | null {
  const t = normAdvisor(message);
  if (/toute la journee|tout au long|toute la journee|besoin (toute|tout le temps)|journee entiere/.test(t)) {
    return true;
  }
  if (/ponctuel|de temps en temps|apres les repas seulement|le soir seulement/.test(t)) {
    return false;
  }
  return null;
}

export function detectExperienceFromMessage(
  message: string,
  prev?: AvaExperienceLevel | null,
): AvaExperienceLevel {
  const t = normAdvisor(message);
  if (
    /je debut|debutant|jamais vape|premiere fois|je connais rien|je n y connais (absolument )?rien|n y connais (absolument )?rien|completement debut|commencer la cigarette/.test(
      t,
    )
  ) {
    return "BEGINNER";
  }
  if (
    /vape depuis (plusieurs )?(annees|ans)|je suis (un )?expert|rebuild|rta|rda|subohm|0[.,]\d+\s*ohm|\d+\s*w\b/.test(
      t,
    )
  ) {
    return "EXPERT";
  }
  if (/je me debrouille|je connais (deja )?un peu|autonome/.test(t)) return "AUTONOMOUS";
  if (/un peu (deja )?vape|j ai deja un (pod|kit|materiel)/.test(t)) return "GUIDED";
  return prev || "BEGINNER";
}

export function vapeStatusFromLevel(level: AvaExperienceLevel): "debutant" | "guide" | "autonome" | "confirme" {
  if (level === "EXPERT") return "confirme";
  if (level === "AUTONOMOUS") return "autonome";
  if (level === "GUIDED") return "guide";
  return "debutant";
}

export function levelFromVapeStatus(
  status: string | null | undefined,
): AvaExperienceLevel {
  if (status === "confirme") return "EXPERT";
  if (status === "autonome") return "AUTONOMOUS";
  if (status === "guide") return "GUIDED";
  return "BEGINNER";
}

export function beginnerHasEnoughForFirstDevice(answers: Record<string, string>): boolean {
  const cigs =
    parseCigarettesPerDay(answers.cigsPerDay || "") ??
    (answers.cigsPerDay && /^\d+$/.test(answers.cigsPerDay)
      ? Number(answers.cigsPerDay)
      : null);
  const allDayKnown =
    answers.allDay === "yes" ||
    answers.allDay === "no" ||
    answers.allDay === "true" ||
    answers.allDay === "false" ||
    detectAllDayNeed(answers.whenStrongest || "") != null;
  return cigs != null && cigs > 0 && allDayKnown;
}

export const FORBIDDEN_CLIENT_MEMORY_PHRASES = [
  /dossier client/i,
  /fiche client/i,
  /base (de )?client/i,
  /donnees sauvegardees/i,
  /memoire informatique/i,
  /je retrouve votre dossier/i,
  /j['’]ouvre votre fiche/i,
  /j['’]ai charge votre fiche/i,
];

export const FORBIDDEN_CLIENT_INTERNAL_SPEAK = [
  /tableau boutique/i,
  /table boutique/i,
  /notre moteur/i,
  /notre algorithme/i,
  /selon (notre|vos) (tableau|table|donnees|dossier)/i,
  /avis m[eé]dical/i,
  /pas un besoin exact/i,
  /pas une obligation/i,
  /sans puff ni jetable/i,
];

export function containsInternalShopSpeak(text: string): boolean {
  return FORBIDDEN_CLIENT_INTERNAL_SPEAK.some((re) => re.test(text));
}

export function containsForbiddenMemoryLanguage(text: string): boolean {
  return FORBIDDEN_CLIENT_MEMORY_PHRASES.some((re) => re.test(text));
}

export function beginnerForbiddenQuestion(text: string): boolean {
  const t = normAdvisor(text);
  return (
    /vous preferez mtl ou rdl/.test(t) ||
    /quelle puissance souhaitez/.test(t) ||
    /quelle valeur de resistance/.test(t) ||
    /quel chipset/.test(t)
  );
}
