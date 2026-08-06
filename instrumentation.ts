export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { assertProductionSafeBoot } = await import("@/lib/production-guards");
      assertProductionSafeBoot();
    } catch (err) {
      console.error(err);
      throw err;
    }

    const { default: prisma } = await import("@/lib/prisma");
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log("[All Vap's] Prisma warm-up OK");
    } catch (err) {
      console.warn("[All Vap's] Prisma warm-up skipped:", err);
    }

    try {
      const { logEmailStartupStatus } = await import("@/lib/email/config");
      logEmailStartupStatus();
    } catch {
      console.log("[All Vap's] Service e-mail : statut indisponible au démarrage.");
    }

    try {
      const { getSumUpSyncConfig, isSumUpSyncConfigured } = await import("@/lib/sumup/config");
      const cfg = getSumUpSyncConfig();
      if (cfg.syncEnabled && isSumUpSyncConfigured()) {
        const { runSumUpSync } = await import("@/lib/sumup/sync-service");
        void runSumUpSync({ force: false, lockOwner: `boot-${process.pid}` })
          .then((r) => {
            console.log(`[All Vap's] Sync SumUp démarrage: ${r.message}`);
          })
          .catch(() => {
            console.warn("[All Vap's] Sync SumUp démarrage indisponible");
          });
      }
    } catch {
      /* ignore */
    }
  }
}
