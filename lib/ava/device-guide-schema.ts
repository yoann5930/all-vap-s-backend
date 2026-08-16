/**
 * Format Guide AVA — architecture réutilisable par modèle exact.
 * Les sections ne sont affichées que si la notice vérifiée les renseigne.
 * Ne jamais générer un schéma ou une séquence de boutons.
 *
 * Statuts alignés sur VapeDeviceManual.verificationStatus :
 * OFFICIAL_CONFIRMED | OFFICIAL_PARTIAL → affichables
 * NEEDS_CONFIRMATION | NEEDS_OFFICIAL_DATA | DISCONTINUED → fallback sûr
 *
 * Admin futur : sélection produit → notice → commandes → visuels → validation → publication.
 */
export const AVA_GUIDE_SECTION_IDS = [
  "overview",
  "controls",
  "power",
  "fill",
  "coil",
  "charging",
  "menu",
  "lock",
  "maintenance",
] as const;

export type AvaGuideSectionId = (typeof AVA_GUIDE_SECTION_IDS)[number];

export const AVA_GUIDE_ILLUSTRATION_KEYS = [
  "overview",
  "controls",
  "fill",
  "coil",
  "charging",
  "menu",
  "maintenance",
] as const;

export type AvaGuideIllustrationKey = (typeof AVA_GUIDE_ILLUSTRATION_KEYS)[number];
