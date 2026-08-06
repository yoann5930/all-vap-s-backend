import prisma from "@/lib/prisma";
import type { JwtPayload } from "@/lib/jwt";

export type InventoryAuditInput = {
  user?: JwtPayload | null;
  inventoryId: string;
  inventoryItemId?: string | null;
  action: string;
  fieldName?: string | null;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  reason?: string | null;
};

function stringifyValue(v: string | number | boolean | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Journal d'audit inventaire dédié — ne remplace pas AuditLog global. */
export async function writeInventoryAudit(input: InventoryAuditInput): Promise<void> {
  try {
    await prisma.inventoryAuditLog.create({
      data: {
        inventoryId: input.inventoryId,
        inventoryItemId: input.inventoryItemId || null,
        userId: input.user?.userId || null,
        userEmail: input.user?.email || null,
        action: input.action,
        fieldName: input.fieldName || null,
        oldValue: stringifyValue(input.oldValue),
        newValue: stringifyValue(input.newValue),
        reason: input.reason || null,
      },
    });
  } catch (err) {
    console.error(
      "[inventory-audit] write failed:",
      err instanceof Error ? err.message : "unknown"
    );
  }
}
