#!/usr/bin/env tsx
/**
 * Tests unitaires SumUp sync (sans appeler l'API SumUp réelle).
 * Usage: npm run sumup:test
 */
import { isRefundTransaction, isSuccessfulSale } from "../lib/sumup/api-client";
import { matchSumUpProductLine } from "../lib/sumup/transaction-matcher";
import { writeSumUpSyncReport } from "../lib/sumup/sync-report";
import { getSumUpSyncConfig } from "../lib/sumup/config";
import fs from "node:fs";
import path from "node:path";

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

// --- Statuts vente / remboursement ---
assert(
  isSuccessfulSale({ status: "SUCCESSFUL", type: "PAYMENT" } as never) === true,
  "SUCCESSFUL = vente"
);
assert(
  isSuccessfulSale({ status: "PAID_OUT", type: "PAYMENT" } as never) === true,
  "PAID_OUT = vente"
);
assert(
  isSuccessfulSale({ status: "PENDING", type: "PAYMENT" } as never) === false,
  "PENDING n'est pas une vente appliquée"
);
assert(
  isSuccessfulSale({ status: "SUCCESSFUL", type: "REFUND" } as never) === false,
  "REFUND n'est pas une vente"
);
assert(
  isRefundTransaction({ type: "REFUND", status: "SUCCESSFUL" } as never) === true,
  "type REFUND détecté"
);

// --- Matching catalogue ---
const catalog = [
  {
    id: "p1",
    name: "Ice Cool - Cassis Citron",
    normalizedName: "ice cool cassis citron",
    sku: "AV-0001",
    barcode: null as string | null,
    sumupProductId: null as string | null,
    brand: "Liquidarom",
  },
];

const auto = matchSumUpProductLine({ name: "Ice Cool - Cassis Citron", quantity: 1 }, catalog);
assert(auto.decision === "AUTO" && auto.productId === "p1", "match exact AUTO");

const unmatched = matchSumUpProductLine({ name: "Produit Inexistant XYZ", quantity: 1 }, catalog);
assert(unmatched.decision === "UNMATCHED" || unmatched.decision === "REVIEW", "non-match");

// --- Config chemins catalogues ---
const cfg = getSumUpSyncConfig();
assert(cfg.syncIntervalSeconds === 1800 || cfg.syncIntervalSeconds > 0, "intervalle sync défini");
assert(cfg.catalogueMagasinPath.includes("catalogue-magasin"), "chemin magasin");
assert(cfg.catalogueAvaPath.includes("catalogue-ava"), "chemin ava");

// --- Rapport fichier ---
const report = writeSumUpSyncReport({
  ok: true,
  dryRun: true,
  skipped: false,
  syncRunId: "test",
  transactionsFetched: 1,
  transactionsProcessed: 1,
  transactionsSkipped: 0,
  duplicates: 0,
  salesApplied: 1,
  refundsApplied: 0,
  unrecognizedLines: 0,
  errors: [],
  message: "test rapport",
});
assert(fs.existsSync(report.jsonPath), "rapport JSON écrit");
assert(fs.existsSync(report.mdPath), "rapport MD écrit");
assert(fs.existsSync(path.join(path.dirname(report.jsonPath), "sumup-sync-latest.json")), "latest JSON");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
