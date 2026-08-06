/**
 * URLs logos fabricants — safe client + server (pas de node:fs).
 * Le composant Image gère l'absence via onError / fallback texte.
 */
export function manufacturerLogoCandidates(slug: string): string[] {
  return [
    `/media/manufacturers/${slug}/logo-on-dark.webp`,
    `/media/manufacturers/${slug}/logo.webp`,
    `/media/manufacturers/${slug}/logo.png`,
    `/media/manufacturers/${slug}/logo.svg`,
  ];
}

/** Première URL candidate (affichage client). */
export function manufacturerLogoUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return manufacturerLogoCandidates(slug)[0] ?? null;
}
