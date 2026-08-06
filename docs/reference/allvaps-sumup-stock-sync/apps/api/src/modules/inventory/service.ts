import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

export async function applyStockMovement(input: {
  variantId: string;
  delta: number;
  type: StockMovementType;
  source: string;
  externalId?: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;

    const variant = await tx.variant.findUnique({ where: { id: input.variantId } });
    if (!variant) throw new Error('Variant introuvable');

    const after = variant.stockOnHand + input.delta;
    if (!env.ALLOW_NEGATIVE_STOCK && after < 0) throw new Error('Stock insuffisant');

    await tx.variant.update({ where: { id: variant.id }, data: { stockOnHand: after } });
    return tx.stockMovement.create({
      data: {
        variantId: variant.id,
        type: input.type,
        quantityDelta: input.delta,
        quantityBefore: variant.stockOnHand,
        quantityAfter: after,
        source: input.source,
        externalId: input.externalId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
