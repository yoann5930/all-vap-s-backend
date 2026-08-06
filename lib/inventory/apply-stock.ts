import prisma from "@/lib/prisma";
import { isStoreStockCode, type StoreStockCode } from "@/lib/catalog/normalize";
import { setStoreStockQuantity } from "@/lib/catalog/stock";
import { INVENTORY_APPLY_STOCK_FROM, isInventoryStatus } from "@/lib/inventory/status";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { writeAuditLog } from "@/lib/audit/log";
import type { JwtPayload } from "@/lib/jwt";

export type ApplyInventoryStockResult = {
  applied: number;
  skipped: number;
  alreadyApplied: boolean;
  changes: Array<{
    lineId: string;
    productId: string;
    before: number;
    after: number;
  }>;
};

/**
 * Applique les quantités comptées au stock boutique officiel.
 * Réservé admin — jamais pendant le simple comptage employé.
 * Anti double application via stockAppliedAt.
 */
export async function applyInventorySessionStock(params: {
  sessionId: string;
  user: JwtPayload;
  ip?: string | null;
  confirmToken: string;
  source?: string;
}): Promise<ApplyInventoryStockResult> {
  if (params.confirmToken !== "APPLY_STOCK_CONFIRMED") {
    throw new Error("CONFIRMATION_REQUIRED");
  }

  const session = await prisma.inventorySession.findUnique({
    where: { id: params.sessionId },
    include: { location: true, lines: true },
  });
  if (!session) throw new Error("NOT_FOUND");

  if (session.stockAppliedAt) {
    return { applied: 0, skipped: 0, alreadyApplied: true, changes: [] };
  }

  if (
    !isInventoryStatus(session.status) ||
    !INVENTORY_APPLY_STOCK_FROM.includes(session.status)
  ) {
    throw new Error("INVALID_STATUS");
  }

  const code = session.location.code;
  if (!isStoreStockCode(code)) {
    throw new Error("INVALID_LOCATION");
  }

  let applied = 0;
  let skipped = 0;
  const changes: ApplyInventoryStockResult["changes"] = [];

  for (const line of session.lines) {
    if (!line.productId) {
      skipped++;
      continue;
    }

    let variantId = line.variantId;
    if (!variantId) {
      const variant = await prisma.productVariant.findFirst({
        where: { productId: line.productId, active: true },
        orderBy: { createdAt: "asc" },
      });
      if (!variant) {
        const created = await prisma.productVariant.create({
          data: { productId: line.productId, name: "Standard" },
        });
        variantId = created.id;
      } else {
        variantId = variant.id;
      }
    }

    const result = await setStoreStockQuantity({
      productId: line.productId,
      variantId,
      locationCode: code as StoreStockCode,
      quantity: line.quantityCounted,
      source: params.source || "inventory_admin_apply",
      movementType: "SYNC_SET",
      externalReference: `inventory:${session.id}:line:${line.id}`,
    });

    changes.push({
      lineId: line.id,
      productId: line.productId,
      before: result.before,
      after: result.after,
    });
    applied++;

    await writeAuditLog({
      user: params.user,
      action: "INVENTORY_STOCK_APPLIED",
      storeCode: code,
      productId: line.productId,
      inventoryId: session.id,
      sessionId: session.id,
      newQuantity: line.quantityCounted,
      ip: params.ip,
      metadata: { lineId: line.id, before: result.before, after: result.after },
    });
  }

  const now = new Date();
  await prisma.inventorySession.update({
    where: { id: session.id },
    data: {
      status: "CORRECTED",
      stockAppliedAt: now,
      stockAppliedByUserId: params.user.userId,
      completedAt: session.completedAt || now,
      notes: [
        session.notes,
        `stock_applied_by=${params.user.email}`,
        `applied=${applied}`,
        `skipped=${skipped}`,
        `at=${now.toISOString()}`,
      ]
        .filter(Boolean)
        .join(" | "),
    },
  });

  await writeInventoryAudit({
    user: params.user,
    inventoryId: session.id,
    action: "STOCK_APPLIED",
    fieldName: "stockAppliedAt",
    oldValue: null,
    newValue: now.toISOString(),
    reason: `applied=${applied}; skipped=${skipped}`,
  });

  await writeAuditLog({
    user: params.user,
    action: "INVENTORY_SESSION_STOCK_APPLIED",
    storeCode: code,
    inventoryId: session.id,
    sessionId: session.id,
    ip: params.ip,
    metadata: { applied, skipped },
  });

  return { applied, skipped, alreadyApplied: false, changes };
}
