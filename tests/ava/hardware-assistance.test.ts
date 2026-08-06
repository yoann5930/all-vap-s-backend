/**
 * Tests assistance matériel AVA.
 * npm run ava:hardware:test
 */
import { detectHardwareIntent } from "../../lib/ava/hardware-intent-detector";
import { checkHardwareSafety, SAFETY_STOP_MESSAGE } from "../../lib/ava/hardware-safety";
import { runHardwareDiagnostic } from "../../lib/ava/hardware-diagnostic";
import { requireDeviceConfirmed } from "../../lib/ava/device-confirmation";
import { getCompatibleCoils } from "../../lib/ava/coil-compatibility";
import { identifyDeviceFromText } from "../../lib/ava/device-identification";
import { matchDeviceError } from "../../lib/ava/device-error-messages";
import { applyPronunciations } from "../../lib/ava/pronunciation-engine";
import { FORBIDDEN_ROBOT_PHRASES, sanitizeRobotLanguage } from "../../lib/ava/conversation-style";
import { devicesWithoutOfficialManual, listDevices } from "../../lib/ava/device-support";

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

function confirmed(partial?: { cartridge?: string }) {
  return {
    manufacturer: "Vaporesso",
    model: "XROS 3",
    cartridge: partial?.cartridge,
    confirmationMethod: "CLIENT_SELECTED_IMAGE" as const,
    confirmedAt: new Date().toISOString(),
    confidence: 1 as const,
  };
}

console.log("\n=== AVA hardware assistance ===\n");

assert(!detectHardwareIntent("Je cherche un e-liquide fruité").isHardware, "29. e-liquide ≠ matériel");
assert(detectHardwareIntent("Mon pod fuit").isHardware, "11. pod fuit → hardware");
assert(detectHardwareIntent("No Atomizer sur ma box").isHardware, "24. No Atomizer");
assert(checkHardwareSafety("Ma batterie est gonflée").danger, "25. batterie gonflée → danger");
assert(
  checkHardwareSafety("Ma batterie est gonflée").message === SAFETY_STOP_MESSAGE,
  "25b. consigne sécurité immédiate"
);
assert(checkHardwareSafety("Elle chauffe beaucoup et fume").danger, "26. chauffe/fumée");

{
  const d = runHardwareDiagnostic({ message: "Mon pod fuit", deviceContext: null });
  assert(d.assistanceMode, "13. diagnostic sans modèle → assistance");
  assert(d.showMediaUploader || d.showDeviceConfirmation, "13b. photo ou confirmation");
  assert(!/je ne vous entends/i.test(d.content), "pas de message culpabilisant");
}

{
  const id = identifyDeviceFromText("Vaporesso Xros 3");
  assert(id.candidates.length >= 1, "10. modèle exact trouvé");
  assert(id.requireVisualConfirmation, "17. confirmation visuelle obligatoire");
}

{
  const gate = requireDeviceConfirmed(null);
  assert(!gate.allowed && gate.reason === "DEVICE_NOT_CONFIRMED", "17. sans modèle → refus");
}

{
  const coils = getCompatibleCoils(confirmed());
  assert(
    !coils.allowed && coils.reason === "CARTRIDGE_NOT_CONFIRMED",
    "18. sans cartouche → pas de résistance"
  );
}

{
  const coils = getCompatibleCoils(confirmed({ cartridge: "XROS Mesh 0.8Ω" }));
  assert(coils.allowed === true, "19. modèle + cartouche → coils autorisés");
}

{
  const d = runHardwareDiagnostic({
    message: "Je parle de mon autre cigarette",
    deviceContext: confirmed({ cartridge: "XROS Mesh 0.8Ω" }),
  });
  assert(
    d.deviceContext === null || d.assistanceMode,
    "20. changement matériel invalide / re-identification"
  );
}

assert(matchDeviceError("J'ai No Atomizer")?.display === "No Atomizer", "24b. match erreur");
assert(/\bi\s+tésti\b/i.test(applyPronunciations("Découvrez e.Tasty")), "e.Tasty → i tésti");

{
  const cleaned = sanitizeRobotLanguage("Votre demande a bien été prise en compte.");
  assert(
    !FORBIDDEN_ROBOT_PHRASES[0].test(cleaned),
    "anti-robot : phrase interdite nettoyée"
  );
}

assert(listDevices().length >= 2, "base seed ≥ 2 appareils");
assert(
  devicesWithoutOfficialManual().length >= 1,
  "27. modèles sans notice officielle listés"
);

console.log(`\nRésultat: ${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
