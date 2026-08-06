import prisma from "@/lib/prisma";

export type StockEventType =
  | "SYNC"
  | "SYNC_ERROR"
  | "RUPTURE"
  | "LOW_STOCK"
  | "ORDER_REFUSED"
  | "RESERVE_OK"
  | "SALE_COMMITTED"
  | "SALE_FAILED"
  | "INCONSISTENCY"
  | "FORCE_SYNC";

/**
 * Journal stock — PII minimale, pas de secrets.
 * Persiste dans StockEvent si la table existe, sinon StockMovement note + console.
 */
export async function logStockEvent(params: {
  type: StockEventType;
  message: string;
  productId?: string;
  variantId?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.stockEvent.create({
      data: {
        type: params.type,
        message: params.message.slice(0, 500),
        productId: params.productId || null,
        variantId: params.variantId || null,
        metaJson: params.meta ? JSON.stringify(params.meta).slice(0, 4000) : null,
      },
    });
  } catch {
    console.warn(`[stock-event] ${params.type}: ${params.message}`);
  }
}
