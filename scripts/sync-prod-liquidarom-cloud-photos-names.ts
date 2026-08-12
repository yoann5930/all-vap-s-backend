/**
 * Appelle l’API prod pour sync photos + noms (sans stock).
 * Usage:
 *   $env:INVENTORY_STAFF_SYNC_SECRET="..."
 *   npx tsx scripts/sync-prod-liquidarom-cloud-photos-names.ts --dry-run
 *   npx tsx scripts/sync-prod-liquidarom-cloud-photos-names.ts --apply
 */
const APPLY = process.argv.includes("--apply");
const BASE = process.env.SYNC_BASE_URL || "https://www.allvaps.fr";
const SECRET = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();

async function main() {
  if (!SECRET) {
    console.error("Set INVENTORY_STAFF_SYNC_SECRET");
    process.exit(1);
  }
  const res = await fetch(`${BASE}/api/admin/catalog/sync-liquidarom-cloud-photos-names`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-inventory-sync-secret": SECRET,
    },
    body: JSON.stringify({ apply: APPLY, photosOnly: true }),
  });
  const text = await res.text();
  console.log(res.status, text.slice(0, 4000));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
