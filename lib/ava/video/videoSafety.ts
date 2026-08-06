/**
 * Sécurité vidéos A.V.A. — exclusions puff/JNR, notices reconstructible.
 */
import type { AvaVideo } from "./videoLibrary";

export function isExcludedVideoContext(text: string): { excluded: boolean; reason: string | null } {
  const t = text.toLowerCase();
  if (/\bjnr\b/.test(t)) {
    return { excluded: true, reason: "Les vidéos A.V.A. n'accompagnent pas la marque JNR." };
  }
  if (/\bpuff\b|\bjetable\b|\bdisposable\b/.test(t)) {
    return {
      excluded: true,
      reason: "Les puffs et produits jetables sont exclus de la médiathèque pédagogique A.V.A.",
    };
  }
  return { excluded: false, reason: null };
}

export function videoBlockedByExclusion(video: AvaVideo, contextText: string): boolean {
  const t = contextText.toLowerCase();
  if (video.exclusions.some((e) => e === "puff" || e === "jnr" || e === "jetable")) {
    if (/\bpuff\b|\bjnr\b|\bjetable\b/.test(t)) return true;
  }
  if (video.exclusions.includes("debutant") && /\bdébutant\b|\bdebutant\b|\bje débute\b/i.test(t)) {
    if (video.level === "avance") return true;
  }
  return false;
}

export function getSafetyNotice(video: AvaVideo): string {
  if (video.formatType === "LONG_PEDAGOGIQUE" || video.safetyLevel === "critique") {
    return [
      "⚠ Sécurité reconstructible / avancé",
      "Utilisez un ohmmètre ou un mod régulé fiable.",
      "Ne montez jamais hors des limites du matériel et des accus.",
      "Pas de mécanique pour un débutant.",
      "N'ouvrez jamais une box ni un accu.",
      "Arrêtez en cas de chauffe, odeur, court-circuit, valeur instable ou accu abîmé.",
      "Les mineurs sont exclus. En cas de doute : boutique ou professionnel.",
    ].join(" ");
  }
  if (video.safetyLevel === "attention") {
    return "⚠ Suivez les gestes indiqués. Éteignez l'appareil avant manipulation. +18 ans.";
  }
  return "Vidéo d'aide All Vap's — +18 ans. Elle ne remplace pas un conseil en boutique si le problème persiste.";
}

export function sanitizeVideoForClient(video: AvaVideo) {
  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    shortTitle: video.shortTitle ?? video.title,
    description: video.description,
    category: video.category,
    formatType: video.formatType,
    durationSeconds: video.durationSeconds,
    level: video.level,
    safetyLevel: video.safetyLevel,
    chapters: video.chapters,
    thumbnailPath: video.thumbnailPath,
    videoPath: video.videoPath,
    fallbackText: video.fallbackText,
    status: video.status,
    sourceStatus: video.sourceStatus,
    safetyNotice: getSafetyNotice(video),
    mediaReady: Boolean(video.videoPath && video.status === "VERIFIED" && video.sourceStatus === "VALIDE"),
  };
}
