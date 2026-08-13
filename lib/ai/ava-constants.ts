export const AVA_NAME = "AVA";
export const AVA_FULL_NAME = "All Vap's Virtual Advisor";

/** Accueil unique — ne jamais répéter ensuite */
export const AVA_GREETING = `Bonjour — Ava, All Vap's.

Liquide, matériel, ou un souci à régler ?`;

export const AVA_SUGGESTIONS = [
  "E-liquide Frais Rouge",
  "DIY",
  "Résistance Vaporesso",
  "Cigarette électronique",
];

export const AVA_NO_EXACT_MATCH =
  "Je n'ai pas l'exacte référence, mais voici des options proches à découvrir juste en dessous.";

export const AVA_NAME_REPLY = "Je m'appelle Ava.";

/** Configuration du modèle facial 3D validé d’AVA. */
export const AVA_3D_ROADMAP = {
  statusLabel: "AVA FACIAL RIG 1.0",
  modelPath:
    "https://pbpecrqwlec9usa3.public.blob.vercel-storage.com/ava/Ava_FacialRig.glb",
  plannedMorphs: [
    "viseme_AA",
    "viseme_E",
    "viseme_I",
    "viseme_O",
    "viseme_U",
    "viseme_MBP",
    "viseme_FV",
    "viseme_L",
    "viseme_CH",
    "viseme_RR",
    "jawOpen",
    "blinkLeft",
    "blinkRight",
    "expressionSmile",
  ] as const,
  enableAdvancedLipSync: true,
  enableIdleAnimations: true,
  enableCompressedAssets: false,
} as const;
