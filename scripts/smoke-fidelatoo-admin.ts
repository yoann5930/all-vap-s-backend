/**
 * Smoke test local — vérifie que les modules Fidelatoo se chargent
 * et que le mock respecte la whitelist (sans appeler d'API Fidelatoo).
 */
process.env.FIDELATOO_ORCHESTRATOR_MOCK = "true";
process.env.FIDELATOO_ORCHESTRATOR_ENABLED = "false";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

async function main() {
  const assert = await import("node:assert/strict");
  const { AVA_FIDELATOO_EMAIL, getFidelatooPublicConfig, FIDELATOO_COMMANDS } = await import(
    "../lib/fidelatoo"
  );
  const { applyMockCommand, getMockSnapshot } = await import("../lib/fidelatoo/mock-state");

  assert.equal(AVA_FIDELATOO_EMAIL, "avaallvaps@gmail.com");
  assert.ok(FIDELATOO_COMMANDS.includes("vm.start"));
  assert.ok(!(FIDELATOO_COMMANDS as readonly string[]).includes("shell.exec"));

  const cfg = getFidelatooPublicConfig();
  assert.equal(cfg.avaEmail, "avaallvaps@gmail.com");

  applyMockCommand("vm.start", { actionId: "t1", qrTtlSec: 60 });
  applyMockCommand("app.open", { actionId: "t2", qrTtlSec: 60 });
  applyMockCommand("ava.start_registration", { actionId: "t3", qrTtlSec: 60 });
  const qr = applyMockCommand("ava.continue_to_qr", { actionId: "t4", qrTtlSec: 60 });
  assert.equal(qr.ok, true);
  assert.ok(qr.qrImageBase64);

  const snap = getMockSnapshot();
  assert.equal(snap.ava, "awaiting_scan");
  assert.equal(snap.avaEmail, "avaallvaps@gmail.com");

  applyMockCommand("ava.qr_scanned", { actionId: "t5", qrTtlSec: 60 });
  applyMockCommand("ava.authorize_store", {
    actionId: "t6",
    qrTtlSec: 60,
    store: "HAUTMONT",
    allow: true,
  });
  const after = getMockSnapshot();
  assert.equal(after.role, "collaboratrice");
  assert.ok(after.stores.includes("HAUTMONT"));

  console.log("OK smoke-fidelatoo-admin");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
