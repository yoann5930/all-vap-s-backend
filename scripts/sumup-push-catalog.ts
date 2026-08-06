/**
 * Push obligatoire noms + images All Vap's → SumUp (via CSV outbox).
 * Usage: npx tsx scripts/sumup-push-catalog.ts [--all] [--force]
 */
import "./load-env";
import { pushCatalogToSumUp } from "../lib/sumup/catalog-push";

async function main() {
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");
  const result = await pushCatalogToSumUp({
    eliquidesOnly: !all,
    forceAll: force,
  });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        message: result.message,
        outboxCsv: result.outboxCsv,
        nameUpdates: result.nameUpdates,
        imageUpdates: result.imageUpdates,
        matchedProducts: result.matchedProducts,
        imagesPubliclyReachable: result.imagesPubliclyReachable,
        publicBaseUrl: result.publicBaseUrl,
        importInstructions: result.importInstructions,
        apiNote: result.apiNote,
      },
      null,
      2
    )
  );
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
