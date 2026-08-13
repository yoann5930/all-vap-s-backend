/**
 * Vérifie que l’EAN affiché après lookup reste celui scanné
 * (pas le barcode catalogue s’il diffère).
 */
import assert from "node:assert/strict";

function barcodeDigits(raw: string | null | undefined): string {
  return String(raw || "").replace(/\D/g, "");
}

function barcodesEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length === 12 && b.length === 13 && b === `0${a}`) return true;
  if (b.length === 12 && a.length === 13 && a === `0${b}`) return true;
  return false;
}

function shownAfterLookup(scannedRaw: string, catalogRaw: string | null): string {
  const scanned = barcodeDigits(scannedRaw);
  const catalog = barcodeDigits(catalogRaw);
  return scanned.length >= 8 ? scanned : catalog || (catalogRaw || "").trim();
}

const scanned = "3760123456789";
const catalogWrong = "9999999999999";
assert.equal(shownAfterLookup(scanned, catalogWrong), scanned);
assert.equal(shownAfterLookup("3760-1234-56789", catalogWrong), scanned);
assert.ok(!barcodesEquivalent(scanned, catalogWrong));
assert.ok(barcodesEquivalent("123456789012", "0123456789012"));
assert.equal(shownAfterLookup("12", catalogWrong), catalogWrong);

console.log("OK barcode-scan-display");
