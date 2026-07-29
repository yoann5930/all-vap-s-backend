/**
 * Configuration SumUp sync — serveur uniquement, jamais exposée au client.
 */
import path from "node:path";

export type SumUpSyncConfig = {
  apiKey: string;
  merchantCode: string;
  apiBaseUrl: string;
  syncEnabled: boolean;
  syncIntervalSeconds: number;
  syncOverlapMinutes: number;
  catalogueMagasinPath: string;
  catalogueAvaPath: string;
  cronSecret: string;
};

function envBool(key: string, fallback = false): boolean {
  const v = (process.env[key] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "1" || v === "yes" || v === "oui";
}

function envInt(key: string, fallback: number): number {
  const n = parseInt(process.env[key] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getSumUpSyncConfig(): SumUpSyncConfig {
  const root = process.cwd();
  return {
    apiKey: (process.env.SUMUP_API_KEY || "").trim(),
    merchantCode: (process.env.SUMUP_MERCHANT_CODE || "").trim(),
    apiBaseUrl: (process.env.SUMUP_API_BASE_URL || "https://api.sumup.com").replace(/\/$/, ""),
    syncEnabled: envBool("SUMUP_SYNC_ENABLED", false),
    syncIntervalSeconds: envInt("SUMUP_SYNC_INTERVAL_SECONDS", 1800),
    syncOverlapMinutes: envInt("SUMUP_SYNC_OVERLAP_MINUTES", 10),
    catalogueMagasinPath: path.resolve(
      root,
      process.env.CATALOGUE_MAGASIN_PATH || "./catalogues/catalogue-magasin-all-vaps.csv"
    ),
    catalogueAvaPath: path.resolve(
      root,
      process.env.CATALOGUE_AVA_PATH || "./catalogues/catalogue-ava-all-vaps.csv"
    ),
    cronSecret: (process.env.CRON_SECRET || process.env.SUMUP_CRON_SECRET || "").trim(),
  };
}

export function isSumUpSyncConfigured(): boolean {
  const c = getSumUpSyncConfig();
  return Boolean(c.apiKey && c.merchantCode);
}

export function maskSecret(value: string | null | undefined, visible = 4): string {
  if (!value) return "(absent)";
  if (value.length <= visible * 2) return "***";
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export function safeLogPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    if (/key|secret|token|password|authorization/i.test(key)) {
      clone[key] = maskSecret(String(clone[key] ?? ""));
    }
  }
  return clone;
}
