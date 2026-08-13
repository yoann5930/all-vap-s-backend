import prisma from "@/lib/prisma";
import { isStoreStockCode, type StoreStockCode } from "@/lib/catalog/normalize";
import {
  computeAvailable,
  getStoreLocationOrThrow,
  syncProductStockMirror,
} from "@/lib/catalog/stock";
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

export type InventoryLineForStockApply = {
  id: string;
  productId: string | null;
  variantId: string | null;
  quantityCounted: number;
};

export type AggregatedStockApplyGroup = {
  productId: string;
  /** Première variante non nulle vue sur les lignes (sinon résolue plus tard). */
  preferredVariantId: string | null;
  lineIds: string[];
  /** Somme des unités comptées (STOCK + VITRINE + multi-EAN). */
  totalUnits: number;
};

/**
 * Agrège les lignes inventaire par produit canonique.
 * Plusieurs lignes (emplacements, alias EAN) → une seule quantité = somme des unités.
 */
export function aggregateLinesForStockApply(
  lines: InventoryLineForStockApply[]
): { groups: AggregatedStockApplyGroup[]; skippedWithoutProduct: number } {
  let skippedWithoutProduct = 0;
  const byProduct = new Map<string, AggregatedStockApplyGroup>();

  for (const line of lines) {
    if (!line.productId) {
      skippedWithoutProduct += 1;
      continue;
    }
    const qty = Math.max(0, Math.floor(Number(line.quantityCounted) || 0));
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.totalUnits += qty;
      existing.lineIds.push(line.id);
      if (!existing.preferredVariantId && line.variantId) {
        existing.preferredVariantId = line.variantId;
      }
    } else {
      byProduct.set(line.productId, {
        productId: line.productId,
        preferredVariantId: line.variantId,
        lineIds: [line.id],
        totalUnits: qty,
      });
    }
  }

  return { groups: [...byProduct.values()], skippedWithoutProduct };
}

/**
 * Applique les quantités comptées au stock boutique officiel.
 * Réservé admin — jamais pendant le simple comptage employé.
 *
 * Garanties P0#2 :
 * - claim atomique `stockAppliedAt` (anti double-clic / race)
 * - agrégation par productId (somme des unités, pas last-write-wins)
 * - écritures stock + mouvements dans la même transaction que le claim
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

  const location = await getStoreLocationOrThrow(code as StoreStockCode);
  const source = params.source || "inventory_admin_apply";
  const { groups, skippedWithoutProduct } = aggregateLinesForStockApply(
    session.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      variantId: l.variantId,
      quantityCounted: l.quantityCounted,
    }))
  );

  const now = new Date();

  type TxResult =
    | { kind: "already" }
    | {
        kind: "ok";
        applied: number;
        skipped: number;
        changes: ApplyInventoryStockResult["changes"];
        productIds: string[];
      };

  const txResult = await prisma.$transaction(
    async (tx): Promise<TxResult> => {
      // Claim atomique : une seule application gagne
      const claimed = await tx.inventorySession.updateMany({
        where: {
          id: session.id,
          stockAppliedAt: null,
          status: { in: [...INVENTORY_APPLY_STOCK_FROM] },
        },
        data: {
          status: "CORRECTED",
          stockAppliedAt: now,
          stockAppliedByUserId: params.user.userId,
          completedAt: session.completedAt || now,
        },
      });

      if (claimed.count !== 1) {
        return { kind: "already" };
      }

      const changes: ApplyInventoryStockResult["changes"] = [];
      const productIds: string[] = [];
      let applied = 0;

      for (const group of groups) {
        let variantId = group.preferredVariantId;
        if (!variantId) {
          const variant = await tx.productVariant.findFirst({
            where: { productId: group.productId, active: true },
            orderBy: { createdAt: "asc" },
          });
          if (!variant) {
            const created = await tx.productVariant.create({
              data: { productId: group.productId, name: "Standard" },
            });
            variantId = created.id;
          } else {
            variantId = variant.id;
          }
        }

        const existing = await tx.stockLevel.findUnique({
          where: {
            variantId_locationId: {
              variantId,
              locationId: location.id,
            },
          },
        });

        const before = existing?.quantity ?? 0;
        const after = Math.max(0, group.totalUnits);
        const reserved = Math.min(existing?.reservedQuantity ?? 0, after);
        const available = computeAvailable(after, reserved);

        await tx.stockLevel.upsert({
          where: {
            variantId_locationId: {
              variantId,
              locationId: location.id,
            },
          },
          create: {
            productId: group.productId,
            variantId,
            locationId: location.id,
            quantity: after,
            reservedQuantity: 0,
            availableQuantity: after,
            source,
            lastSyncedAt: now,
          },
          update: {
            quantity: after,
            reservedQuantity: reserved,
            availableQuantity: available,
            source,
            lastSyncedAt: now,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: group.productId,
            variantId,
            locationId: location.id,
            movementType: "SYNC_SET",
            quantityBefore: before,
            quantityChange: after - before,
            quantityAfter: after,
            source,
            externalReference: `inventory:${session.id}:product:${group.productId}`,
          },
        });

        for (const lineId of group.lineIds) {
          changes.push({
            lineId,
            productId: group.productId,
            before,
            after,
          });
        }
        productIds.push(group.productId);
        applied += 1;
      }

      const skipped = skippedWithoutProduct;
      await tx.inventorySession.update({
        where: { id: session.id },
        data: {
          notes: [
            session.notes,
            `stock_applied_by=${params.user.email}`,
            `applied=${applied}`,
            `skipped=${skipped}`,
            `aggregated_products=${groups.length}`,
            `at=${now.toISOString()}`,
          ]
            .filter(Boolean)
            .join(" | "),
        },
      });

      return { kind: "ok", applied, skipped, changes, productIds };
    },
    {
      // Réduit les courses entre deux apply concurrents
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 30000,
    }
  );

  if (txResult.kind === "already") {
    return { applied: 0, skipped: 0, alreadyApplied: true, changes: [] };
  }

  // Miroir Product.stock hors TX (somme dual boutiques)
  for (const productId of [...new Set(txResult.productIds)]) {
    try {
      await syncProductStockMirror(productId);
    } catch {
      /* ne bloque pas l’apply déjà commitée */
    }
  }

  await writeInventoryAudit({
    user: params.user,
    inventoryId: session.id,
    action: "STOCK_APPLIED",
    fieldName: "stockAppliedAt",
    oldValue: null,
    newValue: now.toISOString(),
    reason: `applied=${txResult.applied}; skipped=${txResult.skipped}; aggregated=${groups.length}`,
  });

  await writeAuditLog({
    user: params.user,
    action: "INVENTORY_SESSION_STOCK_APPLIED",
    storeCode: code,
    inventoryId: session.id,
    sessionId: session.id,
    ip: params.ip,
    metadata: {
      applied: txResult.applied,
      skipped: txResult.skipped,
      aggregatedProducts: groups.length,
    },
  });

  for (const change of txResult.changes) {
    await writeAuditLog({
      user: params.user,
      action: "INVENTORY_STOCK_APPLIED",
      storeCode: code,
      productId: change.productId,
      inventoryId: session.id,
      sessionId: session.id,
      newQuantity: change.after,
      ip: params.ip,
      metadata: {
        lineId: change.lineId,
        before: change.before,
        after: change.after,
        aggregated: true,
      },
    });
  }

  return {
    applied: txResult.applied,
    skipped: txResult.skipped,
    alreadyApplied: false,
    changes: txResult.changes,
  };
}
