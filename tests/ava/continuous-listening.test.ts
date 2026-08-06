/**
 * Tests écoute permanente / modes d'entrée AVA.
 * npm run ava:continuous:test
 */
import {
  conversationStatusLabel,
  createInitialInputModeState,
  recordEmptyRecognition,
  recordUserSpoke,
  recordUserTyped,
  resolveInputMode,
  shouldAutoOpenText,
  type AvaInputMode,
} from "../../lib/ava/input-mode-manager";
import {
  MAX_VOICE_PROMPTS,
  pickSilenceHint,
  shouldOpenTextAfterSilence,
  shouldShowSilenceHint,
  SILENCE_AUTO_TEXT_MS,
  SILENCE_FIRST_HINT_MS,
  SILENCE_HINTS,
} from "../../lib/ava/silence-detector";
import {
  confirmationPrompt,
  estimateTranscriptionConfidence,
  needsConfirmation,
} from "../../lib/ava/transcription-confidence";
import { micBusyMessage } from "../../lib/ava/microphone-state";

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

console.log("\n=== AVA continuous listening ===\n");

// 1. Micro autorisé → VOICE_ACTIVE
assert(
  resolveInputMode({
    canListen: true,
    micPermission: "granted",
    listeningPausedByUser: false,
  }) === "VOICE_ACTIVE",
  "1. Micro autorisé → VOICE_ACTIVE"
);

// 2. Micro refusé → VOICE_PERMISSION_DENIED / label texte
assert(
  resolveInputMode({
    canListen: true,
    micPermission: "denied",
    listeningPausedByUser: false,
  }) === "VOICE_PERMISSION_DENIED",
  "2. Micro refusé → VOICE_PERMISSION_DENIED"
);
assert(
  conversationStatusLabel("VOICE_PERMISSION_DENIED", "idle") === "Mode texte activé",
  "2b. Label mode texte si micro refusé"
);

// 3. Aucun micro / recognition unsupported
assert(
  resolveInputMode({
    canListen: false,
    micPermission: "unsupported",
    listeningPausedByUser: false,
  }) === "VOICE_UNAVAILABLE",
  "3. Reconnaissance indisponible → VOICE_UNAVAILABLE"
);

// 4. Micro busy message (humain, pas culpabilisant)
assert(
  /écrire/i.test(micBusyMessage()) && !/échoué|pas compris/i.test(micBusyMessage()),
  "4. Message micro occupé orienté texte"
);

// 5. Silence prolongé → ouvrir texte
assert(
  shouldOpenTextAfterSilence({
    listeningMs: SILENCE_AUTO_TEXT_MS,
    promptCount: 0,
    emptyResults: 0,
  }),
  "5. Silence prolongé → ouvrir texte"
);
assert(
  shouldShowSilenceHint({ listeningMs: SILENCE_FIRST_HINT_MS, promptCount: 0 }),
  "5b. Afficher hint après premier délai"
);

// 6. Bruit / empty results
assert(
  shouldOpenTextAfterSilence({
    listeningMs: 1000,
    promptCount: 0,
    emptyResults: 3,
  }),
  "6. Reconnaissances vides répétées → texte"
);

// 7. Mauvaise transcription
assert(estimateTranscriptionConfidence("euh") === "low", "7. 'euh' → low confidence");
assert(needsConfirmation("euh"), "7b. Confirmation requise si low");
assert(
  /C'est bien cela/i.test(confirmationPrompt("pod fuit")),
  "7c. Prompt de confirmation reformulé"
);
assert(!needsConfirmation("Mon pod fuit depuis hier"), "7d. Phrase claire → pas de confirm");

// 8. Client clavier seulement
{
  let s = createInitialInputModeState();
  s = recordUserTyped(s);
  s = recordUserTyped(s);
  assert(s.preferred === "text", "8. Préférence session texte après clavier");
}

// 9. Voix → clavier
{
  let s = createInitialInputModeState();
  s = recordUserSpoke(s);
  s = recordUserTyped(s);
  assert(s.preferred === "mixed", "9. Voix puis clavier → mixed");
}

// 10. Clavier → voix
{
  let s = createInitialInputModeState();
  s = recordUserTyped(s);
  s = recordUserSpoke(s);
  assert(s.preferred === "mixed", "10. Clavier puis voix → mixed");
}

// 11. Accessibilité (écoute suspendue)
assert(
  resolveInputMode({
    canListen: true,
    micPermission: "granted",
    listeningPausedByUser: true,
  }) === "ACCESSIBILITY_MODE",
  "11. Pause volontaire → ACCESSIBILITY_MODE"
);
assert(
  conversationStatusLabel("ACCESSIBILITY_MODE", "listening") === "Mode texte activé",
  "11b. Label accessibilité = mode texte"
);

// 12–13. Labels statut (lecteur d'écran / pas couleur seule)
const labels: AvaInputMode[] = [
  "VOICE_ACTIVE",
  "TEXT_FALLBACK",
  "VOICE_NO_SIGNAL",
];
for (const mode of labels) {
  const l = conversationStatusLabel(mode, "listening");
  assert(typeof l === "string" && l.length > 3, `12/13. Label lisible pour ${mode}`);
}

// 14–17. Phases UI (mobile / desktop / chromium — labels stables)
assert(
  conversationStatusLabel("VOICE_ACTIVE", "listening") === "AVA vous écoute",
  "14–17. AVA vous écoute"
);
assert(
  conversationStatusLabel("VOICE_ACTIVE", "thinking") === "AVA réfléchit",
  "14–17. AVA réfléchit"
);
assert(
  conversationStatusLabel("VOICE_ACTIVE", "speaking") === "AVA vous répond",
  "14–17. AVA vous répond"
);

// 18. Fermeture = mode idle / pas force écoute sans consent
assert(
  resolveInputMode({
    canListen: true,
    micPermission: "unknown",
    listeningPausedByUser: false,
  }) === "VOICE_PERMISSION_REQUIRED",
  "18. Sans consentement → PERMISSION_REQUIRED (pas écoute forcée)"
);

// 19. Réouverture / force texte
assert(
  resolveInputMode({
    canListen: true,
    micPermission: "granted",
    listeningPausedByUser: false,
    forceText: true,
  }) === "TEXT_FALLBACK",
  "19. forceText → TEXT_FALLBACK"
);

// 20. Refus consentement
assert(
  resolveInputMode({
    canListen: true,
    micPermission: "denied",
    listeningPausedByUser: false,
  }) === "VOICE_PERMISSION_DENIED",
  "20. Refus consentement → denied + texte"
);

// Auto-open après silences
{
  let s = createInitialInputModeState();
  s = { ...s, silencePrompts: MAX_VOICE_PROMPTS };
  assert(shouldAutoOpenText(s), "Auto-open texte après max prompts");
  s = createInitialInputModeState();
  s = recordEmptyRecognition(s);
  s = recordEmptyRecognition(s);
  assert(shouldAutoOpenText(s), "Auto-open texte après empty ×2");
}

// Hints non culpabilisants
for (const h of SILENCE_HINTS) {
  assert(
    !/pas compris|échoué|n'entends pas|je ne vous entends/i.test(h),
    `Hint sans culpabilisation: "${h.slice(0, 40)}…"`
  );
}
assert(pickSilenceHint(0) === SILENCE_HINTS[0], "pickSilenceHint index 0");

console.log(`\nRésultat: ${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
