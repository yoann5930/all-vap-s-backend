/**
 * File d'attente inventaire hors ligne (localStorage).
 */

export interface OfflineInventoryLine {
  sessionId: string;
  barcode: string;
  quantityCounted: number;
  unitPrice?: string;
  confirmZeroPrice?: boolean;
  queuedAt: string;
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

export async function queueOfflineInventoryLine(
  line: Omit<OfflineInventoryLine, "queuedAt">
): Promise<void> {
  const queue = readQueue();
  queue.push({ ...line, queuedAt: new Date().toISOString() });
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

  for (const item of queue) {
    try {
      const res = await fetch(`${base}/${item.sessionId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: item.barcode,
          quantityCounted: item.quantityCounted,
          unitPrice: item.unitPrice,
          confirmZeroPrice: item.confirmZeroPrice,
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
