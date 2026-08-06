/**
 * État opérationnel SumUp / stock / infra — voyants dashboard admin.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import prisma from "@/lib/prisma";
import { GLOBAL_STOCK_CODE } from "@/lib/catalog/normalize";
import { isSumUpSyncConfigured, getSumUpSyncConfig } from "@/lib/sumup/config";
import { testSumUpConnection } from "@/lib/sumup/api-client";
import { getSumUpInboxDir, listInboxItemsExportCsv } from "@/lib/sumup/inbox";

export type StatusLight = "ok" | "warn" | "error";

export type StatusPill = {
  key: string;
  label: string;
  light: StatusLight;
  detail: string;
};

export type SumUpOpsDashboard = {
  generatedAt: string;
  lights: StatusPill[];
  stats: {
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncFileName: string | null;
    referencesInStock: number;
    unitsAvailable: number;
    outOfStock: number;
    lowStock: number;
    errorCountLastRun: number;
    duplicateCountLastRun: number;
    unmatchedCountLastRun: number;
    createCountLastRun: number;
    updatedCountLastRun: number;
    unchangedCountLastRun: number;
    inboxFilesPending: number;
    inboxFilesProcessed: number;
  };
  recentRuns: Array<{
    id: string;
    source: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    fileName: string | null;
    importedCount: number;
    updatedCount: number;
    unchangedCount: number;
    createCount: number;
    duplicateCount: number;
    unmatchedCount: number;
    errorCount: number;
  }>;
};

function lightEmoji(l: StatusLight): string {
  return l === "ok" ? "🟢" : l === "warn" ? "🟠" : "🔴";
}

export { lightEmoji };

async function checkPostgres(): Promise<StatusPill> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      key: "postgres",
      label: "PostgreSQL",
      light: "ok",
      detail: "Connexion OK",
    };
  } catch (e) {
    return {
      key: "postgres",
      label: "PostgreSQL",
      light: "error",
      detail: e instanceof Error ? e.message : "Connexion impossible",
    };
  }
}

function checkDocker(): StatusPill {
  try {
    const out = execSync("docker info", {
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    if (/Server Version/i.test(out) || /Containers/i.test(out)) {
      return {
        key: "docker",
        label: "Docker",
        light: "ok",
        detail: "Daemon accessible",
      };
    }
    return {
      key: "docker",
      label: "Docker",
      light: "warn",
      detail: "Réponse inattendue",
    };
  } catch {
    return {
      key: "docker",
      label: "Docker",
      light: "warn",
      detail: "Docker non détecté sur cette machine (peut être OK en prod)",
    };
  }
}

export async function getSumUpOpsDashboard(): Promise<SumUpOpsDashboard> {
  const cfg = getSumUpSyncConfig();
  const postgres = await checkPostgres();
  const docker = checkDocker();

  let connectionLight: StatusPill;
  if (!isSumUpSyncConfigured()) {
    connectionLight = {
      key: "sumup",
      label: "Connexion SumUp",
      light: "warn",
      detail: "Clés API non configurées — CSV inbox toujours utilisable",
    };
  } else {
    const conn = await testSumUpConnection();
    connectionLight = {
      key: "sumup",
      label: "Connexion SumUp",
      light: conn.ok ? "ok" : "error",
      detail: conn.ok ? "API OK" : conn.message || "Échec connexion",
    };
  }

  const location = await prisma.stockLocation.findUnique({
    where: { code: GLOBAL_STOCK_CODE },
  });

  const levels = location
    ? await prisma.stockLevel.findMany({
        where: { locationId: location.id },
        select: { availableQuantity: true, lowStockThreshold: true },
      })
    : [];

  const unitsAvailable = levels.reduce((s, l) => s + l.availableQuantity, 0);
  const referencesInStock = levels.filter((l) => l.availableQuantity > 0).length;
  const outOfStock = levels.filter((l) => l.availableQuantity <= 0).length;
  const lowStock = levels.filter(
    (l) => l.availableQuantity > 0 && l.availableQuantity <= l.lowStockThreshold
  ).length;

  const lastRun = await prisma.syncRun.findFirst({
    where: { dryRun: false },
    orderBy: { startedAt: "desc" },
  });

  const syncState = await prisma.sumUpSyncState.findUnique({
    where: { id: "default" },
  });

  const lastSyncAt =
    syncState?.lastSuccessfulSyncAt?.toISOString() ||
    lastRun?.completedAt?.toISOString() ||
    lastRun?.startedAt?.toISOString() ||
    null;

  let lastSyncLight: StatusPill;
  if (!lastRun) {
    lastSyncLight = {
      key: "last_sync",
      label: "Dernière synchronisation",
      light: "warn",
      detail: "Aucune sync enregistrée",
    };
  } else if (lastRun.status === "FAILED" || (lastRun.errorCount ?? 0) > 20) {
    lastSyncLight = {
      key: "last_sync",
      label: "Dernière synchronisation",
      light: "error",
      detail: `${lastRun.status} — ${lastRun.errorCount} erreurs`,
    };
  } else if ((lastRun.errorCount ?? 0) > 0 || (lastRun.unmatchedCount ?? 0) > 50) {
    lastSyncLight = {
      key: "last_sync",
      label: "Dernière synchronisation",
      light: "warn",
      detail: `${lastRun.status} — ${lastRun.unmatchedCount} inconnus / ${lastRun.errorCount} erreurs`,
    };
  } else {
    lastSyncLight = {
      key: "last_sync",
      label: "Dernière synchronisation",
      light: "ok",
      detail: lastSyncAt
        ? new Date(lastSyncAt).toLocaleString("fr-FR")
        : lastRun.status,
    };
  }

  const inboxDir = getSumUpInboxDir();
  const inboxExists = fs.existsSync(inboxDir);
  const pending = listInboxItemsExportCsv();
  const processedCount = await prisma.sumUpInboxFile.count({
    where: { status: "IMPORTED" },
  });

  const inboxLight: StatusPill = !inboxExists
    ? {
        key: "inbox",
        label: "Inbox SumUp",
        light: "warn",
        detail: `Dossier absent : ${path.basename(inboxDir)}`,
      }
    : pending.length === 0
      ? {
          key: "inbox",
          label: "Inbox SumUp",
          light: "warn",
          detail: "Aucun CSV articles",
        }
      : {
          key: "inbox",
          label: "Inbox SumUp",
          light: "ok",
          detail: `${pending.length} fichier(s) — dernier : ${pending[0].fileName}`,
        };

  const stockLight: StatusPill =
    referencesInStock === 0
      ? {
          key: "stock",
          label: "Stock central",
          light: "error",
          detail: "Aucune référence en stock (StockLevel)",
        }
      : outOfStock > referencesInStock
        ? {
            key: "stock",
            label: "Stock central",
            light: "warn",
            detail: `${referencesInStock} en stock / ${outOfStock} ruptures · ${unitsAvailable} unités`,
          }
        : {
            key: "stock",
            label: "Stock central",
            light: "ok",
            detail: `${referencesInStock} réf. · ${unitsAvailable} unités · emplacement ${GLOBAL_STOCK_CODE}`,
          };

  const workerLight: StatusPill = cfg.syncEnabled
    ? {
        key: "worker",
        label: "Worker sync",
        light: "ok",
        detail: `Activé (intervalle ${cfg.syncIntervalSeconds}s)`,
      }
    : {
        key: "worker",
        label: "Worker sync",
        light: "warn",
        detail: "Désactivé — sync manuelle / cron OK",
      };

  const writeLight: StatusPill = {
    key: "stock_write",
    label: "Écriture stock SumUp",
    light: cfg.stockWriteMode === "disabled" ? "ok" : "warn",
    detail:
      cfg.stockWriteMode === "disabled"
        ? "disabled — aucune API stock write publique (conforme)"
        : `Mode ${cfg.stockWriteMode} — vérifier accès partenaire officiel`,
  };

  const recentRuns = await prisma.syncRun.findMany({
    where: { dryRun: false },
    orderBy: { startedAt: "desc" },
    take: 30,
    select: {
      id: true,
      source: true,
      status: true,
      startedAt: true,
      completedAt: true,
      fileName: true,
      importedCount: true,
      updatedCount: true,
      unchangedCount: true,
      createCount: true,
      duplicateCount: true,
      unmatchedCount: true,
      errorCount: true,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    lights: [
      connectionLight,
      postgres,
      docker,
      lastSyncLight,
      inboxLight,
      stockLight,
      workerLight,
      writeLight,
    ],
    stats: {
      lastSyncAt,
      lastSyncStatus: lastRun?.status ?? null,
      lastSyncFileName: lastRun?.fileName ?? null,
      referencesInStock,
      unitsAvailable,
      outOfStock,
      lowStock,
      errorCountLastRun: lastRun?.errorCount ?? 0,
      duplicateCountLastRun: lastRun?.duplicateCount ?? 0,
      unmatchedCountLastRun: lastRun?.unmatchedCount ?? 0,
      createCountLastRun: lastRun?.createCount ?? 0,
      updatedCountLastRun: lastRun?.updatedCount ?? 0,
      unchangedCountLastRun: lastRun?.unchangedCount ?? 0,
      inboxFilesPending: pending.length,
      inboxFilesProcessed: processedCount,
    },
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      source: r.source,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      fileName: r.fileName,
      importedCount: r.importedCount,
      updatedCount: r.updatedCount,
      unchangedCount: r.unchangedCount,
      createCount: r.createCount,
      duplicateCount: r.duplicateCount,
      unmatchedCount: r.unmatchedCount,
      errorCount: r.errorCount,
    })),
  };
}
