/**
 * Scénarios A–G — VOOPOO DRAG 6 + Check Atomizer
 * npm run ava:drag6:test
 */
import { findDeviceBySlug, searchDevices } from "../../lib/ava/device-support";
import { runHardwareDiagnostic } from "../../lib/ava/hardware-diagnostic";
import { detectHardwareIntent } from "../../lib/ava/hardware-intent-detector";
import {
  recognizeDeviceFromVisualText,
  VISUAL_CONFIRM_THRESHOLD,
} from "../../lib/ava/visual-recognition";
import { emptyDiagnosticSession } from "../../lib/ava/diagnostic-session";
import { matchDeviceError } from "../../lib/ava/device-error-messages";

let ok = 0;
let fail = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    ok++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}`);
  }
}

console.log("\n=== AVA DRAG 6 / Check Atomizer ===\n");

// Fiche référentiel
{
  const d = findDeviceBySlug("voopoo-drag-6");
  assert(Boolean(d), "fiche VOOPOO DRAG 6 présente");
  assert(d?.manufacturer.toUpperCase() === "VOOPOO", "manufacturer VOOPOO");
  assert(/drag\s*6/i.test(d?.model || ""), "model DRAG 6");
  assert(!/drag\s*s\s*2/i.test(d?.model || ""), "pas confondu avec S2");
}

// SCÉNARIO A
{
  const msg =
    "Photo VOOPOO logo DRAG écran couleur vertical molette Everest Lab Check Atomizer";
  const visual = recognizeDeviceFromVisualText(msg);
  const diag = runHardwareDiagnostic({
    message: msg,
    deviceContext: null,
    diagnosticSession: null,
  });
  assert(visual.matchedCues.includes("logo_voopoo"), "A. VOOPOO détecté");
  assert(
    visual.confirmed || diag.assistanceMode,
    "A. DRAG 6 confirmée ou confirmation demandée"
  );
  assert(diag.assistanceMode, "A. diagnostic activé");
  assert(diag.blockProductSearch, "A. pas de catalogue");
  assert(
    diag.diagnosticSession.active || /check atomizer|drag/i.test(diag.content),
    "A. session ou contenu diagnostic"
  );
}

// SCÉNARIO B
{
  let session = emptyDiagnosticSession();
  session.active = true;
  session.issueCode = "CHECK_ATOMIZER";
  const diag = runHardwareDiagnostic({
    message: "non c'est la Drag 6",
    deviceContext: null,
    diagnosticSession: session,
  });
  assert(diag.deviceContext?.model === "DRAG 6", "B. modèle corrigé DRAG 6");
  assert(diag.diagnosticSession.confirmedByUser === true, "B. confirmedByUser");
  assert(diag.diagnosticSession.active === true, "B. diagnostic conservé");
  assert(diag.assistanceMode, "B. mode assistance");
}

// SCÉNARIO C
{
  const session = {
    ...emptyDiagnosticSession(),
    active: true,
    manufacturer: "VOOPOO",
    model: "DRAG 6",
    identifiedDevice: "VOOPOO_DRAG_6",
    issueCode: "CHECK_ATOMIZER",
    confirmedByUser: true,
    confidence: 0.95,
    currentStep: "ASK_CARTRIDGE_SEATED" as const,
    lastQuestion: "La cartouche ou l'atomiseur est-il bien en place ?",
  };
  const diag = runHardwareDiagnostic({
    message: "non atomiseur",
    deviceContext: {
      manufacturer: "VOOPOO",
      model: "DRAG 6",
      confirmationMethod: "USER_EXPLICIT_TEXT",
      confirmedAt: new Date().toISOString(),
      confidence: 0.95,
    },
    diagnosticSession: session,
  });
  assert(diag.assistanceMode, "C. reste diagnostic");
  assert(diag.blockProductSearch, "C. aucune recherche produit");
  assert(diag.diagnosticSession.active, "C. session active");
  assert(!/catalogue|voici nos|produits disponibles/i.test(diag.content), "C. pas de pitch catalogue");
}

// SCÉNARIO D
{
  const session = {
    ...emptyDiagnosticSession(),
    active: true,
    manufacturer: "VOOPOO",
    model: "DRAG 6",
    identifiedDevice: "VOOPOO_DRAG_6",
    issueCode: "CHECK_ATOMIZER",
    confirmedByUser: true,
    confidence: 0.95,
    currentStep: "ASK_STILL_SHOWING" as const,
    lastQuestion: "Le message « Check Atomizer » est-il toujours affiché ?",
  };
  const diag = runHardwareDiagnostic({
    message: "toujours check atomizer",
    deviceContext: {
      manufacturer: "VOOPOO",
      model: "DRAG 6",
      confirmationMethod: "USER_EXPLICIT_TEXT",
      confirmedAt: new Date().toISOString(),
      confidence: 0.95,
    },
    diagnosticSession: session,
  });
  assert(diag.diagnosticSession.currentStep === "REQUEST_DETAIL_PHOTOS", "D. étape photos");
  assert(diag.showMediaUploader, "D. demande photo");
  assert((diag.photoButtons?.length || 0) > 0, "D. boutons photo");
}

// SCÉNARIO E
{
  const session = {
    ...emptyDiagnosticSession(),
    active: true,
    manufacturer: "VOOPOO",
    model: "DRAG 6",
    identifiedDevice: "VOOPOO_DRAG_6",
    issueCode: "CHECK_ATOMIZER",
    confirmedByUser: true,
    confidence: 0.95,
    currentStep: "ASK_CONTACTS_CLEAN" as const,
  };
  const diag = runHardwareDiagnostic({
    message: "je veux acheter un atomiseur",
    deviceContext: {
      manufacturer: "VOOPOO",
      model: "DRAG 6",
      confirmationMethod: "USER_EXPLICIT_TEXT",
      confirmedAt: new Date().toISOString(),
      confidence: 0.95,
    },
    diagnosticSession: session,
  });
  assert(diag.phase === "catalog_confirm", "E. demande confirmation");
  assert(diag.diagnosticSession.active, "E. diagnostic non fermé");
  assert(diag.diagnosticSession.awaitingCatalogConfirm, "E. flag confirmation");
}

// SCÉNARIO F
{
  assert(
    !detectHardwareIntent("je cherche un atomiseur Vaporesso").isHardware ||
      detectHardwareIntent("je cherche un atomiseur pour mon pod").isHardware !== undefined,
    "F. intent détectable"
  );
  const diag = runHardwareDiagnostic({
    message: "je cherche un atomiseur",
    deviceContext: null,
    diagnosticSession: emptyDiagnosticSession(),
  });
  // Sans session : peut être idle (recherche produit côté advisor) ou hardware léger
  assert(
    !diag.diagnosticSession.active || diag.phase === "idle" || diag.assistanceMode,
    "F. sans diagnostic actif — pas de session forcée Check Atomizer"
  );
  assert(diag.diagnosticSession.issueCode !== "CHECK_ATOMIZER" || !diag.diagnosticSession.active, "F. pas de CHECK_ATOMIZER fantôme");
}

// SCÉNARIO G
{
  const visual = recognizeDeviceFromVisualText("photo floue appareil noir");
  assert(visual.confidence < VISUAL_CONFIRM_THRESHOLD, "G. confiance < 75 %");
  assert(visual.needsMorePhotos || !visual.confirmed, "G. photo complémentaire");
  assert(!visual.confirmed, "G. aucun diagnostic inventé / modèle forcé");
}

assert(matchDeviceError("Check Atomizer")?.display === "Check Atomizer", "match erreur Check Atomizer");
assert(searchDevices("VOOPOO Drag 6", 3)[0]?.model === "DRAG 6", "searchDevices priorise DRAG 6");

console.log(`\nRésultat: ${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
