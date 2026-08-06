/**
 * Tests accessibilité / bascule texte AVA.
 * npm run ava:a11y:test
 */
import {
  DEFAULT_ACCESSIBILITY_PREFS,
  loadAccessibilityPrefs,
  saveAccessibilityPrefs,
} from "../../lib/ava/accessibility-mode";
import {
  conversationStatusLabel,
  createInitialInputModeState,
  recordEmptyRecognition,
  resolveInputMode,
  shouldAutoOpenText,
} from "../../lib/ava/input-mode-manager";
import {
  pickSilenceHint,
  shouldOpenTextAfterSilence,
  SILENCE_HINTS,
} from "../../lib/ava/silence-detector";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

console.log("\n=== AVA accessibility fallback ===\n");

assert(
  DEFAULT_ACCESSIBILITY_PREFS.subtitlesAlways === true,
  "Sous-titres activés par défaut"
);
assert(
  DEFAULT_ACCESSIBILITY_PREFS.pauseListening === false,
  "Écoute non suspendue par défaut"
);

// Session prefs sans window → defaults
const loaded = loadAccessibilityPrefs();
assert(
  loaded.subtitlesAlways === true && loaded.pauseListening === false,
  "loadAccessibilityPrefs sans window → defaults"
);

// save no-op sans window
saveAccessibilityPrefs({
  ...DEFAULT_ACCESSIBILITY_PREFS,
  pauseListening: true,
});
assert(true, "saveAccessibilityPrefs sans window ne lance pas");

assert(
  resolveInputMode({
    canListen: true,
    micPermission: "denied",
    listeningPausedByUser: false,
  }) === "VOICE_PERMISSION_DENIED",
  "Refus micro → mode denied (texte)"
);

assert(
  conversationStatusLabel("TEXT_FALLBACK", "idle") === "Mode texte activé",
  "Indicateur Mode texte activé"
);

assert(
  conversationStatusLabel("VOICE_ACTIVE", "listening") === "AVA vous écoute",
  "Indicateur écoute visible (texte, pas couleur seule)"
);

// Silence → invitation douce puis texte
const hint = pickSilenceHint(1);
assert(/écrire|écrit|photo|temps/i.test(hint), "Hint silence invite écriture");
assert(
  !SILENCE_HINTS.some((h) => /je ne vous entends|pas compris/i.test(h)),
  "Aucun hint culpabilisant"
);

assert(
  shouldOpenTextAfterSilence({ listeningMs: 20000, promptCount: 2, emptyResults: 0 }),
  "Après 2 relances + silence → texte"
);

{
  let s = createInitialInputModeState({ emptyRecognitionCount: 0 });
  s = recordEmptyRecognition(s);
  s = recordEmptyRecognition(s);
  assert(shouldAutoOpenText(s), "2 empty recognition → auto text");
}

assert(
  resolveInputMode({
    canListen: true,
    micPermission: "granted",
    listeningPausedByUser: true,
  }) === "ACCESSIBILITY_MODE",
  "Suspension volontaire dans Accessibilité et confidentialité"
);

assert(
  resolveInputMode({
    canListen: false,
    micPermission: "unsupported",
    listeningPausedByUser: false,
  }) === "VOICE_UNAVAILABLE",
  "Appareil sans speech → unavailable (clavier)"
);

assert(
  resolveInputMode({
    canListen: true,
    micPermission: "granted",
    listeningPausedByUser: false,
    noSignal: true,
  }) === "VOICE_NO_SIGNAL",
  "Pas de signal audio → VOICE_NO_SIGNAL"
);

assert(
  conversationStatusLabel("VOICE_NO_SIGNAL", "listening").includes("écrire"),
  "NO_SIGNAL propose l'écrit"
);

console.log(`\nRésultat: ${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
