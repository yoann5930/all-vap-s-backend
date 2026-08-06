/**
 * Régénère les PDF d'une commande avec les modèles brandés All Vap's.
 * Usage: npx tsx scripts/regenerate-order-documents.ts <orderId>
 */
import { existsSync, readFileSync } from "fs";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: npx tsx scripts/regenerate-order-documents.ts <orderId>");
    process.exit(1);
  }
  const { generateAndStoreOrderDocument } = await import("../lib/documents/service");
  for (const type of ["ORDER_FORM", "PREP_SLIP", "INVOICE"] as const) {
    const doc = await generateAndStoreOrderDocument(orderId, type);
    console.log(JSON.stringify({ type, id: doc.id, path: doc.storagePath, size: doc.sizeBytes }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
