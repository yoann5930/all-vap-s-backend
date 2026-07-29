/**
 * Client SumUp API — transactions marchand (serveur uniquement).
 */
import { getSumUpSyncConfig, isSumUpSyncConfigured } from "@/lib/sumup/config";

export type SumUpTransactionHistoryItem = {
  id?: string;
  transaction_id?: string;
  transaction_code?: string;
  amount?: number;
  currency?: string;
  timestamp?: string;
  status?: string;
  type?: string;
  payment_type?: string;
  product_summary?: string;
  simple_status?: string;
  refunded_amount?: number;
};

export type SumUpTransactionProduct = {
  name?: string;
  quantity?: number;
  price?: number;
  total_price?: number;
};

export type SumUpTransactionFull = SumUpTransactionHistoryItem & {
  products?: SumUpTransactionProduct[];
  simple_status?: string;
};

export type SumUpConnectionTestResult = {
  ok: boolean;
  merchantCode: string;
  sampleTransactionCount: number;
  message: string;
  error?: string;
};

async function sumupApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = getSumUpSyncConfig();
  if (!cfg.apiKey || !cfg.merchantCode) {
    throw new Error("SUMUP_NOT_CONFIGURED");
  }

  const url = `${cfg.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SumUp API ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  return response.json() as Promise<T>;
}

export async function testSumUpConnection(): Promise<SumUpConnectionTestResult> {
  const cfg = getSumUpSyncConfig();
  if (!isSumUpSyncConfigured()) {
    return {
      ok: false,
      merchantCode: cfg.merchantCode || "(absent)",
      sampleTransactionCount: 0,
      message: "SUMUP_API_KEY ou SUMUP_MERCHANT_CODE manquant",
      error: "SUMUP_NOT_CONFIGURED",
    };
  }

  try {
    const data = await listTransactionHistory({ limit: 1 });
    return {
      ok: true,
      merchantCode: cfg.merchantCode,
      sampleTransactionCount: data.items.length,
      message: "Connexion SumUp OK",
    };
  } catch (err) {
    return {
      ok: false,
      merchantCode: cfg.merchantCode,
      sampleTransactionCount: 0,
      message: "Échec connexion SumUp",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listTransactionHistory(params: {
  oldestTime?: Date;
  newestTime?: Date;
  limit?: number;
}): Promise<{ items: SumUpTransactionHistoryItem[] }> {
  const cfg = getSumUpSyncConfig();
  const qs = new URLSearchParams();
  if (params.oldestTime) qs.set("oldest_time", params.oldestTime.toISOString());
  if (params.newestTime) qs.set("newest_time", params.newestTime.toISOString());
  if (params.limit) qs.set("limit", String(params.limit));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const data = await sumupApiFetch<{ items?: SumUpTransactionHistoryItem[] }>(
    `/v2.1/merchants/${encodeURIComponent(cfg.merchantCode)}/transactions/history${suffix}`
  );
  return { items: data.items ?? [] };
}

export async function getTransactionFull(params: {
  id?: string;
  transactionCode?: string;
}): Promise<SumUpTransactionFull> {
  const cfg = getSumUpSyncConfig();
  const qs = new URLSearchParams();
  if (params.id) qs.set("id", params.id);
  if (params.transactionCode) qs.set("transaction_code", params.transactionCode);

  return sumupApiFetch<SumUpTransactionFull>(
    `/v2.1/merchants/${encodeURIComponent(cfg.merchantCode)}/transactions?${qs.toString()}`
  );
}

export function resolveTransactionId(tx: SumUpTransactionHistoryItem): string | null {
  return tx.transaction_id || tx.id || tx.transaction_code || null;
}

export function isRefundTransaction(tx: SumUpTransactionHistoryItem | SumUpTransactionFull): boolean {
  const type = (tx.type || "").toUpperCase();
  const status = (tx.simple_status || tx.status || "").toUpperCase();
  return type === "REFUND" || status.includes("REFUND");
}

export function isSuccessfulSale(tx: SumUpTransactionHistoryItem | SumUpTransactionFull): boolean {
  const status = (tx.simple_status || tx.status || "").toUpperCase();
  if (isRefundTransaction(tx)) return false;
  // Ne jamais appliquer une vente PENDING (risque de double décrément).
  return status === "SUCCESSFUL" || status === "PAID_OUT";
}
