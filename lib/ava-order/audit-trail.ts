/**
 * Journal d'audit commandes AVA — timestamp + orderId.
 * JSONL local. Ne pollue pas OrderStatusHistory (réservé aux vrais changements de statut).
 */
import { appendFile, mkdir } from "fs/promises";
import path from "path";
import type { AvaOrderAuditEvent } from "@/lib/ava-order/constants";

const AUDIT_DIR = path.join(process.cwd(), "storage", "ava-audit");

export async function recordAvaOrderEvent(
  orderId: string,
  event: AvaOrderAuditEvent,
  detail?: Record<string, unknown>,
): Promise<void> {
  const at = new Date().toISOString();
  const line = JSON.stringify({ at, orderId, event, detail: detail || null }) + "\n";
  try {
    await mkdir(AUDIT_DIR, { recursive: true });
    await appendFile(path.join(AUDIT_DIR, `${at.slice(0, 10)}.jsonl`), line);
  } catch (err) {
    console.warn("[ava-order] audit file failed", err);
  }
}
