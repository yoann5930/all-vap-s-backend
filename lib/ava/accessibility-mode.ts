/**
 * Préférences d'accessibilité AVA — session uniquement.
 */
export type AvaAccessibilityPrefs = {
  /** Suspend l'écoute continue volontairement */
  pauseListening: boolean;
  /** Sous-titres toujours affichés */
  subtitlesAlways: boolean;
  /** Texte plus grand */
  largeText: boolean;
  /** Contraste renforcé */
  highContrast: boolean;
};

export const DEFAULT_ACCESSIBILITY_PREFS: AvaAccessibilityPrefs = {
  pauseListening: false,
  subtitlesAlways: true,
  largeText: false,
  highContrast: false,
};

const KEY = "allvaps_ava_a11y_session";

export function loadAccessibilityPrefs(): AvaAccessibilityPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_ACCESSIBILITY_PREFS };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_ACCESSIBILITY_PREFS };
    return { ...DEFAULT_ACCESSIBILITY_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_PREFS };
  }
}

export function saveAccessibilityPrefs(prefs: AvaAccessibilityPrefs): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
