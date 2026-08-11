/**
 * File d'attente inventaire hors ligne (localStorage).
 */

export interface OfflineInventoryLine {
  sessionId: string;
  barcode: string;
  quantityCounted: number;
  /** STOCK | VITRINE */
  placement?: "STOCK" | "VITRINE";
  unitPrice?: string;
  unitPriceCents?: number;
  priceSource?: string;
  productId?: string;
  productName?: string;
  brand?: string;
  range?: string;
  confirmZeroPrice?: boolean;
  queuedAt: string;
  clientLineId: string;
}

const KEY = "allvaps_inventory_offline_queue";

function readQueue(): OfflineInventoryLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OfflineInventoryLine[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineInventoryLine[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function getOfflineQueueCount(): number {
  return readQueue().length;
}

export async function queueOfflineInventoryLine(
  line: Omit<OfflineInventoryLine, "queuedAt" | "clientLineId"> & { clientLineId?: string }
): Promise<void> {
  const queue = readQueue();
  queue.push({
    ...line,
    clientLineId:
      line.clientLineId ||
      `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  });
  writeQueue(queue);
}

export async function flushOfflineInventoryQueue(
  apiBase = "/api/inventaire/sessions"
): Promise<{ flushed: number; failed: number }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, failed: 0 };

  const remaining: OfflineInventoryLine[] = [];
  let flushed = 0;
  let failed = 0;
  const base = apiBase.replace(/\/$/, "");
  const seen = new Set<string>();

  for (const item of queue) {
    if (seen.has(item.clientLineId)) {
      flushed++;
      continue;
    }
    seen.add(item.clientLineId);

    try {
      const res = await fetch(`${base}/${item.sessionId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: item.barcode || undefined,
          quantityCounted: item.quantityCounted,
          placement: item.placement || "STOCK",
          unitPrice: item.unitPrice,
          unitPriceCents: item.unitPriceCents,
          priceSource: item.priceSource,
          productId: item.productId,
          productName: item.productName,
          brand: item.brand,
          range: item.range,
          confirmZeroPrice: item.confirmZeroPrice,
          clientLineId: item.clientLineId,
        }),
      });
      if (!res.ok) {
        remaining.push(item);
        failed++;
      } else {
        flushed++;
      }
    } catch {
      remaining.push(item);
      failed++;
    }
  }

  writeQueue(remaining);
  return { flushed, failed };
}
