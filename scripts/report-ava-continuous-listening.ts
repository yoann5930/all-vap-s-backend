/**
 * Rapport de validation — écoute permanente / accessibilité AVA
 * npm run ava:listening:test && tsx scripts/report-ava-continuous-listening.ts
 */
import { existsSync } from "fs";
import { join } from "path";
import {
  conversationStatusLabel,
  resolveInputMode,
} from "../lib/ava/input-mode-manager";
import { SILENCE_HINTS } from "../lib/ava/silence-detector";
import { needsConfirmation } from "../lib/ava/transcription-confidence";
import { DEFAULT_ACCESSIBILITY_PREFS } from "../lib/ava/accessibility-mode";
import { AVA_VOICE_CONFIG } from "../lib/ai/ava/config";

const root = process.cwd();
let ok = 0;
let fail = 0;

function check(cond: boolean, label: string) {
  if (cond) {
    ok++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}`);
  }
}

console.log("\n========== RAPPORT FINAL AVA — ÉCOUTE PERMANENTE ==========\n");

const required = [
  "lib/ava/input-mode-manager.ts",
  "lib/ava/microphone-state.ts",
  "lib/ava/silence-detector.ts",
  "lib/ava/transcription-confidence.ts",
  "lib/ava/accessibility-mode.ts",
  "components/ava/ConversationStatus.tsx",
  "components/ava/LiveSubtitles.tsx",
  "components/ava/TextFallback.tsx",
  "components/ava/AccessibilitySettings.tsx",
  "hooks/useAvaContinuousListening.ts",
  "hooks/useAvaInputFallback.ts",
  "tests/ava/continuous-listening.test.ts",
  "tests/ava/accessibility-fallback.test.ts",
  "components/ai/ImmersiveAvaScreen.tsx",
];

console.log("--- Architecture (§13) ---");
for (const f of required) {
  check(existsSync(join(root, f)), f);
}

console.log("\n--- Config voix ---");
check(AVA_VOICE_CONFIG.continuousMode === true, "continuousMode = true");
check(AVA_VOICE_CONFIG.autoResumeListening === true, "autoResumeListening = true");

console.log("\n--- Règles produit (§15) ---");
check(
  conversationStatusLabel("VOICE_ACTIVE", "listening") === "AVA vous écoute",
  "Indicateur écoute"
);
check(
  conversationStatusLabel("VOICE_ACTIVE", "thinking") === "AVA réfléchit",
  "Indicateur réflexion"
);
check(
  conversationStatusLabel("VOICE_ACTIVE", "speaking") === "AVA vous répond",
  "Indicateur réponse"
);
check(
  conversationStatusLabel("TEXT_FALLBACK", "idle") === "Mode texte activé",
  "Indicateur mode texte"
);
check(
  resolveInputMode({
    canListen: true,
    micPermission: "denied",
    listeningPausedByUser: false,
  }) === "VOICE_PERMISSION_DENIED",
  "Refus micro → mode denied"
);
check(
  resolveInputMode({
    canListen: true,
    micPermission: "unknown",
    listeningPausedByUser: false,
  }) === "VOICE_PERMISSION_REQUIRED",
  "Sans consentement → permission required"
);
check(
  resolveInputMode({
    canListen: true,
    micPermission: "granted",
    listeningPausedByUser: true,
  }) === "ACCESSIBILITY_MODE",
  "Pause accessibilité respectée"
);
check(DEFAULT_ACCESSIBILITY_PREFS.subtitlesAlways === true, "Sous-titres ON par défaut");
check(needsConfirmation("euh"), "Confirmation si transcription incertaine");
check(
  SILENCE_HINTS.every((h) => !/pas compris|je ne vous entends/i.test(h)),
  "Hints silence non culpabilisants"
);

console.log("\n--- Couverture tests manuels hors automate ---");
console.log("  INFO  14–17 (Android / iPhone / Windows / Chromium) : validation navigateur manuelle");
console.log("  INFO  12 lecteur d'écran : ARIA présents (role=status, alertdialog, sr-only mic)");
console.log("  INFO  18–19 fermeture / réouverture : stopAll() sur unmount ImmersiveAvaScreen");

console.log(`\n========== TOTAL: ${ok} PASS, ${fail} FAIL ==========\n`);
if (fail > 0) process.exit(1);
console.log("Verdict automate : GO pour mission écoute permanente / accessibilité.");
console.log("Rester à valider en navigateur réel : micro live, TTS, fermeture onglet.\n");
