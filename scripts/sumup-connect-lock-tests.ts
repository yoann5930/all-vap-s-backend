#!/usr/bin/env tsx
/**
 * Verrouillage non-régression du connecteur SumUp stock.
 * Ne casse pas le module : vérifie contrats + anti-doublon hash + stock central.
 *
 * Usage: npm run sumup:lock-test
 */
import fs from "node:fs";
import path from "node:path";
import { sha256Content, listInboxItemsExportCsv, findLatestItemsExportCsv } from "../lib/sumup/inbox";
import { connectSumUpStock, mirrorSumUpLinkedStockToLevels } from "../lib/sumup/stock-connect";
import { getOfficialAvailableQuantity } from "../lib/catalog/stock-official";
import { linkSumUpProductsToCatalogHierarchy } from "../lib/catalog/link-sumup-hierarchy";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log("OK ", label);
  } else {
    failed++;
    console.error("FAIL", label);
  }
}

async function main() {
  // Contrats publics stables
  assert(typeof connectSumUpStock === "function", "connectSumUpStock exporté");
  assert(typeof mirrorSumUpLinkedStockToLevels === "function", "mirrorSumUpLinkedStockToLevels exporté");
  assert(typeof findLatestItemsExportCsv === "function", "findLatestItemsExportCsv exporté");

  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  assert(
    typeof pkg.scripts["sumup:connect-stock"] === "string",
    "npm script sumup:connect-stock présent"
  );
  assert(
    pkg.scripts["sumup:connect-stock"].includes("sumup-connect-stock"),
    "sumup:connect-stock pointe le CLI attendu"
  );

  // Hash déterministe
  const h1 = sha256Content("a,b,c\n1,2,3");
  const h2 = sha256Content("a,b,c\n1,2,3");
  const h3 = sha256Content("a,b,c\n1,2,4");
  assert(h1 === h2 && h1.length === 64, "sha256 stable 64 hex");
  assert(h1 !== h3, "sha256 change si contenu change");

  // Inbox list ne plante pas
  const listed = listInboxItemsExportCsv();
  assert(Array.isArray(listed), "listInboxItemsExportCsv retourne un tableau");

  // Stock officiel helper
  assert(typeof getOfficialAvailableQuantity === "function", "getOfficialAvailableQuantity");

  // Hiérarchie : dry call (DB)
  try {
    const link = await linkSumUpProductsToCatalogHierarchy({ onlyMissing: true, limit: 5 });
    assert(typeof link.scanned === "number", "linkSumUpProductsToCatalogHierarchy OK");
  } catch (e) {
    assert(false, `link hierarchy: ${e instanceof Error ? e.message : e}`);
  }

  // Fichiers critiques présents
  const critical = [
    "lib/sumup/stock-connect.ts",
    "lib/sumup/catalog-push.ts",
    "lib/sumup/sync-service.ts",
    "lib/catalog/sumup-import-service.ts",
    "lib/stock/guard.ts",
    "scripts/sumup-connect-stock.ts",
  ];
  for (const f of critical) {
    assert(fs.existsSync(path.resolve(f)), `fichier critique ${f}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
