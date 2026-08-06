/**
 * Orchestrateur — tous les contrôles catalogue.
 * Exit 0 uniquement si TOUT est vert.
 *
 * Usage: npx tsx scripts/catalog-validate-all.ts
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();

function run(label: string, script: string, args: string[] = []): number {
  console.log(`\n═══ ${label} ═══`);
  const r = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", script, ...args],
    { cwd: ROOT, stdio: "inherit", shell: true }
  );
  const code = r.status ?? 1;
  console.log(`→ ${label}: exit ${code}`);
  return code;
}

function main() {
  // Assurer la référence à jour
  run("build-reference", "scripts/build-catalogue-reference-obligatoire.ts");

  const codes = [
    run("audit-strict", "scripts/catalog-audit-strict.ts", ["--json"]),
    run("validate-routes", "scripts/catalog-validate-routes.ts"),
    run("validate-media", "scripts/catalog-validate-media.ts"),
    run("validate-sumup", "scripts/catalog-validate-sumup.ts"),
  ];

  const failed = codes.filter((c) => c !== 0).length;
  console.log("\n════════════════════════════");
  if (failed === 0) {
    console.log("catalog:validate:all → PASS (0 erreur)");
    console.log("Mission catalogue : conditions techniques remplies.");
  } else {
    console.log(`catalog:validate:all → FAIL (${failed} suite(s) en erreur)`);
    console.log("MISSION NON TERMINÉE — ne pas écrire « mission terminée ».");
    console.log("Voir docs/RAPPORT_VALIDATION_AUTOMATIQUE_CATALOGUE.md");
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
