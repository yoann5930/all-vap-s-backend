/**
 * Tests support appareil / verrous.
 * npm run ava:device:test
 */
import { getCompatibleCoils, getCompatibleCartridges } from "../../lib/ava/coil-compatibility";
import { getDeviceControls, getFillingProcedure } from "../../lib/ava/device-support";
import { getManualHelp } from "../../lib/ava/manual-search";

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

const ctx = {
  manufacturer: "Vaporesso",
  model: "XROS 3",
  confirmationMethod: "CLIENT_SELECTED_IMAGE" as const,
  confirmedAt: new Date().toISOString(),
  confidence: 1 as const,
};

console.log("\n=== AVA device support ===\n");

assert(!getCompatibleCoils(null).allowed, "coils sans contexte → refus");
assert(!getDeviceControls(null).allowed, "controls sans contexte → refus");
assert(!getFillingProcedure(null).allowed, "filling sans contexte → refus");
assert(!getManualHelp(null, "filling").allowed, "manual sans contexte → refus");

assert(getDeviceControls(ctx).allowed === true, "controls avec appareil OK");
assert(getFillingProcedure(ctx).allowed === true, "filling avec appareil OK");
assert(
  getCompatibleCartridges(ctx).allowed === true,
  "cartouches listables après confirmation appareil"
);
assert(
  !getCompatibleCoils(ctx).allowed,
  "coils refusés tant que cartouche non confirmée"
);

const withCart = { ...ctx, cartridge: "XROS Mesh 0.8Ω" };
assert(getCompatibleCoils(withCart).allowed === true, "coils OK avec cartouche");
assert(
  (getCompatibleCoils(withCart).coils?.length ?? 0) > 0,
  "liste coils non vide (seed)"
);

console.log(`\nRésultat: ${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
