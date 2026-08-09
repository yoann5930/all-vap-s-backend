/**
 * Gardes Admin / catalogue — pack Work 2026-08-09.
 * Non destructif : signale, n’écrit pas.
 */

export type AsyncState<T> =
  | { status: "LOADING" }
  | { status: "SUCCESS"; data: T }
  | { status: "EMPTY"; data: [] }
  | { status: "ERROR"; code: string; retryable: boolean };

export interface AdminProductGuardInput {
  active: boolean;
  priceCents?: number | null;
}

export function adminProductGuard(
  p: AdminProductGuardInput
): "OK" | "PRODUCT_REVIEW_REQUIRED" | "NOT_PURCHASABLE" {
  if (!p.active) return "NOT_PURCHASABLE";
  if (p.priceCents == null || p.priceCents <= 0) return "PRODUCT_REVIEW_REQUIRED";
  return "OK";
}

export function purchasability(input: {
  active: boolean;
  priceCents?: number | null;
}): "PURCHASABLE" | "NOT_PURCHASABLE" | "PRODUCT_REVIEW_REQUIRED" {
  const g = adminProductGuard(input);
  if (g === "OK") return "PURCHASABLE";
  return g;
}

export interface StockMetrics {
  out: number;
  low: number;
}

export interface StockRow {
  productId: string;
  hautmont: number;
  leQuesnoy: number;
  global: number;
}

export function assertStockConsistency(metrics: StockMetrics, rows: StockRow[]): string[] {
  const out = rows.filter((r) => r.global <= 0).length;
  const low = rows.filter((r) => r.global > 0 && r.global <= 5).length;
  return [
    out !== metrics.out ? `OUT_MISMATCH:${metrics.out}:${out}` : "",
    low !== metrics.low ? `LOW_MISMATCH:${metrics.low}:${low}` : "",
  ].filter(Boolean);
}
