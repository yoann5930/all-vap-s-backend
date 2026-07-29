#!/usr/bin/env tsx
/**
 * Worker SumUp — boucle serveur (Docker / Render worker / PM2).
 * Ne démarre que si SUMUP_SYNC_ENABLED=true.
 */
import prisma from "../lib/prisma";
import { getSumUpSyncConfig } from "../lib/sumup/config";
import { runSumUpSync } from "../lib/sumup/sync-service";

async function tick() {
  const cfg = getSumUpSyncConfig();
  if (!cfg.syncEnabled) {
    console.log("[sumup:worker] SUMUP_SYNC_ENABLED=false — en attente (aucune sync)");
    return;
  }
  console.log(`[sumup:worker] Sync démarrée ${new Date().toISOString()}`);
  const result = await runSumUpSync({ dryRun: false, lockOwner: "worker" });
  console.log(`[sumup:worker] ${result.message}`);
  if (result.errors.length) {
    console.error("[sumup:worker] erreurs:", result.errors.slice(0, 5));
  }
}

async function main() {
  const cfg = getSumUpSyncConfig();
  const intervalMs = cfg.syncIntervalSeconds * 1000;
  console.log(
    `[sumup:worker] Démarrage — intervalle ${cfg.syncIntervalSeconds}s, enabled=${cfg.syncEnabled}`
  );

  await tick();
  setInterval(() => {
    tick().catch((e) => console.error("[sumup:worker]", e));
  }, intervalMs);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
