export const AVA_NAME = "AVA";
export const AVA_FULL_NAME = "All Vap's Virtual Advisor";

/** Accueil unique — ne jamais répéter ensuite */
export const AVA_GREETING = `Bonjour, je m'appelle Ava.

Que recherchez-vous ?`;

export const AVA_SUGGESTIONS = [
  "E-liquide Frais Rouge",
  "DIY",
  "Résistance Vaporesso",
  "Cigarette électronique",
];

export const AVA_NO_EXACT_MATCH =
  "Je n'ai pas l'exacte référence, mais voici des options proches à découvrir juste en dessous.";

export const AVA_NAME_REPLY = "Je m'appelle Ava.";

/**
 * Feuille de route 3D AVA — flags non activés (préparation sans changer le rendu actuel).
 * Activer uniquement après validation modèle + tests.
 */
export const AVA_3D_ROADMAP = {
  /** PROTOYPE TECHNIQUE — jamais présenté comme final */
  statusLabel: "PROTOYPE TECHNIQUE",
  /** Chemin relatif public du modèle de test */
  modelPath: "/models/ava/ava-test-model.glb",
  texturePath: "/models/ava/ava-test-texture.png",
  /** Morph targets à brancher quand le GLB final les exposera */
  plannedMorphs: ["mouthOpen", "jawOpen", "eyeBlinkLeft", "eyeBlinkRight", "mouthSmile"] as const,
  /** Features futures — toutes OFF pour ne pas casser la prod */
  enableAdvancedLipSync: false,
  enableIdleAnimations: false,
  enableCompressedAssets: false,
} as const;
