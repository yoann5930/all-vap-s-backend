/**
 * Surveillance inbox_sumup — import auto d’un nouveau CSV (hash anti-doublon).
 * Usage: npm run sumup:inbox-watch
 *
 * Ne remplace pas `sumup:connect-stock` : appelle le même orchestrateur.
 */
import fs from "node:fs";
import path from "node:path";
import {
  getSumUpInboxDir,
  listInboxItemsExportCsv,
  sha256Content,
  findProcessedInboxByHash,
} from "../lib/sumup/inbox";
import { connectSumUpStock } from "../lib/sumup/stock-connect";

const POLL_MS = Number(process.env.SUMUP_INBOX_POLL_MS || 15000);
const seenHashes = new Set<string>();

async function maybeImport(reason: string) {
  const latest = listInboxItemsExportCsv()[0];
  if (!latest) {
    console.log(`[inbox-watch] aucun CSV (${reason})`);
    return;
  }
  const content = fs.readFileSync(latest.fullPath);
  const hash = sha256Content(content);
  if (seenHashes.has(hash)) return;

  const already = await findProcessedInboxByHash(hash);
  if (already?.status === "IMPORTED") {
    seenHashes.add(hash);
    console.log(`[inbox-watch] skip hash déjà importé: ${latest.fileName}`);
    return;
  }

  console.log(`[inbox-watch] nouveau fichier détecté (${reason}): ${latest.fileName}`);
  const result = await connectSumUpStock({ forceTransactions: true });
  seenHashes.add(hash);
  console.log(`[inbox-watch] ${result.ok ? "OK" : "WARN"} ${result.message}`);
}

async function main() {
  const dir = getSumUpInboxDir();
  fs.mkdirSync(dir, { recursive: true });
  console.log(`[inbox-watch] surveillance ${dir} (poll ${POLL_MS}ms)`);
  console.log(`[inbox-watch] import manuel toujours dispo: npm run sumup:connect-stock`);

  await maybeImport("startup");

  try {
    fs.watch(dir, { persistent: true }, async (_event, filename) => {
      if (!filename || !/\.csv$/i.test(filename)) return;
      // léger debounce
      setTimeout(() => {
        maybeImport(`watch:${filename}`).catch((e) =>
          console.error("[inbox-watch] erreur", e)
        );
      }, 1500);
    });
  } catch (e) {
    console.warn("[inbox-watch] fs.watch indisponible, poll seul:", e);
  }

  setInterval(() => {
    maybeImport("poll").catch((e) => console.error("[inbox-watch] poll erreur", e));
  }, POLL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
