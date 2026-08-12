/**
 * Déclenche le backfill barcodes prod (sans stock).
 * Usage:
 *   $env:INVENTORY_STAFF_SYNC_SECRET="..."
 *   node scripts/run-prod-barcode-backfill.mjs
 *   node scripts/run-prod-barcode-backfill.mjs --apply
 */
const APPLY = process.argv.includes("--apply");
const BASE = process.env.SYNC_BASE_URL || "https://www.allvaps.fr";
const SECRET = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();

async function main() {
  if (!SECRET) {
    console.error("Set INVENTORY_STAFF_SYNC_SECRET then re-run.");
    process.exit(1);
  }
  const res = await fetch(`${BASE}/api/admin/catalog/backfill-barcodes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inventory-sync-secret": SECRET,
    },
    body: JSON.stringify({ apply: APPLY }),
  });
  const text = await res.text();
  console.log(`status=${res.status} apply=${APPLY}`);
  console.log(text.slice(0, 4000));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
