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

export function shouldSkipBeginnerQuiz(
  level: AvaExperienceLevel,
  message: string,
): boolean {
  if (level !== "EXPERT" && level !== "AUTONOMOUS") return false;
  return !/je debut|debutant|premiere vape|jamais vape/.test(normAdvisor(message));
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
  return null;
}

export function detectNicotineFeedback(
  message: string,
): "TOO_STRONG" | "TOO_WEAK" | "OK" | "USAGE_UP" | null {
  const t = normAdvisor(message);
  if (/trop fort|trop dose|arrache|me pique|trop de nicotine/.test(t)) return "TOO_STRONG";
  if (/encore envie de fumer|manque( de nicotine)?|trop faible|pas assez/.test(t)) return "TOO_WEAK";
  if (/vape (beaucoup )?plus (que prevu|que d habitude)|je vape trop/.test(t)) return "USAGE_UP";
  if (/ca (me )?convient|c est bien|ca va (bien|nickel)|parfait pour moi/.test(t)) return "OK";
  return null;
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

export function containsForbiddenMemoryLanguage(text: string): boolean {
  return FORBIDDEN_CLIENT_MEMORY_PHRASES.some((re) => re.test(text));
}
