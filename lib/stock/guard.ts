import prisma from "@/lib/prisma";
import {
  ensureGlobalStockLocation,
  computeAvailable,
  type StockStatus,
} from "@/lib/catalog/stock";
import {
  resolveAvailability,
  validateCartStock,
  type CartStockLine,
  type ValidateStockResult,
} from "./availability";
import { logStockEvent } from "./events";
import { maybeEmitStockAlerts } from "./alerts";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function reserveRef(orderId: string, productId: string, variantId?: string | null) {
  return `reserve:order:${orderId}:${productId}:${variantId || "base"}`;
}

function saleRef(orderId: string, productId: string, variantId?: string | null) {
  return `sale:order:${orderId}:${productId}:${variantId || "base"}`;
}

/**
 * Réservation atomique anti-survente (FOR UPDATE via updateMany conditionnel).
 */
export async function reserveStockForOrder(params: {
  orderId: string;
  lines: CartStockLine[];
}): Promise<{ ok: boolean; message: string; code?: string }> {
  const pre = await validateCartStock(params.lines);
  if (!pre.ok) {
    await logStockEvent({
      type: "ORDER_REFUSED",
      message: pre.message,
      meta: { orderId: params.orderId, code: pre.code, lines: pre.lines },
    });
    return { ok: false, message: pre.message, code: pre.code };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const location = await ensureGlobalStockLocation();
        for (const line of params.lines) {
          const ref = reserveRef(params.orderId, line.productId, line.variantId);
          const existing = await tx.stockMovement.findFirst({
            where: { externalReference: ref, movementType: "RESERVE" },
          });
          if (existing) continue;

          let level = line.variantId
            ? await tx.stockLevel.findFirst({
                where: {
                  productId: line.productId,
                  variantId: line.variantId,
                  locationId: location.id,
                },
              })
            : await tx.stockLevel.findFirst({
                where: { productId: line.productId, locationId: location.id },
                orderBy: { updatedAt: "desc" },
              });

          // Bootstrap StockLevel depuis miroir variante/produit si absent
          if (!level) {
            const product = await tx.product.findUnique({
              where: { id: line.productId },
              include: {
                variants: line.variantId
                  ? { where: { id: line.variantId } }
                  : { where: { active: true }, take: 1 },
              },
            });
            if (!product) throw new Error("STOCK_INSUFFICIENT");
            let variant = product.variants[0];
            if (!variant) {
              // Créer une variante miroir minimale pour satisfaire StockLevel.variantId
              variant = await tx.productVariant.create({
                data: {
                  productId: product.id,
                  name: "Standard",
                  stock: product.stock,
                  active: true,
                },
              });
            }
            const qty = variant.stock ?? product.stock;
            if (qty < line.quantity) throw new Error("STOCK_INSUFFICIENT");
            level = await tx.stockLevel.create({
              data: {
                productId: product.id,
                variantId: variant.id,
                locationId: location.id,
                quantity: qty,
                reservedQuantity: 0,
                availableQuantity: qty,
                lowStockThreshold: 5,
                source: "ecommerce_bootstrap",
                lastSyncedAt: new Date(),
              },
            });
          }

          const updated = await tx.stockLevel.updateMany({
            where: {
              id: level.id,
              availableQuantity: { gte: line.quantity },
            },
            data: {
              reservedQuantity: { increment: line.quantity },
              availableQuantity: { decrement: line.quantity },
            },
          });
          if (updated.count !== 1) {
            throw new Error("STOCK_INSUFFICIENT");
          }

          const after = await tx.stockLevel.findUniqueOrThrow({ where: { id: level.id } });
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              variantId: after.variantId,
              locationId: location.id,
              movementType: "RESERVE",
              quantityBefore: after.quantity,
              quantityChange: 0,
              quantityAfter: after.quantity,
              source: "ecommerce",
              externalReference: ref,
            },
          });
        }
      },
      { isolationLevel: "Serializable" }
    );

    await logStockEvent({
      type: "RESERVE_OK",
      message: `Réservation commande ${params.orderId}`,
      meta: { orderId: params.orderId, lines: params.lines },
    });
    return { ok: true, message: "Réservé" };
  } catch {
    await logStockEvent({
      type: "ORDER_REFUSED",
      message: "Désolé, un ou plusieurs produits ne sont plus disponibles.",
      meta: { orderId: params.orderId, lines: params.lines },
    });
    return {
      ok: false,
      message: "Désolé, un ou plusieurs produits ne sont plus disponibles.",
      code: "STOCK_INSUFFICIENT",
    };
  }
}

export async function releaseOrderReservations(orderId: string): Promise<void> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      movementType: "RESERVE",
      externalReference: { startsWith: `reserve:order:${orderId}:` },
    },
  });

  for (const mov of movements) {
    const releaseRef = `release:${mov.externalReference}`;
    const already = await prisma.stockMovement.findFirst({
      where: { externalReference: releaseRef, movementType: "RELEASE" },
    });
    if (already) continue;

    // Quantité réservée = reconstruite via lignes commande
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    const item = order?.items.find(
      (i) =>
        i.productId === mov.productId &&
        (mov.variantId ? i.variantId === mov.variantId : true)
    );
    const qty = item?.quantity || 0;
    if (qty <= 0 || !mov.variantId) continue;

    await prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findFirst({
        where: {
          productId: mov.productId,
          variantId: mov.variantId!,
          locationId: mov.locationId,
        },
      });
      if (!level) return;
      const reserved = Math.max(0, level.reservedQuantity - qty);
      const available = computeAvailable(level.quantity, reserved);
      await tx.stockLevel.update({
        where: { id: level.id },
        data: { reservedQuantity: reserved, availableQuantity: available },
      });
      await tx.stockMovement.create({
        data: {
          productId: mov.productId,
          variantId: mov.variantId,
          locationId: mov.locationId,
          movementType: "RELEASE",
          quantityBefore: level.quantity,
          quantityChange: 0,
          quantityAfter: level.quantity,
          source: "ecommerce",
          externalReference: releaseRef,
        },
      });
    });
  }
}

/**
 * Après paiement : consomme le stock (quantité) et libère la réservation.
 * Met à jour StockLevel + Product.stock + ProductVariant.stock.
 */
export async function commitSaleForOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { ok: false, message: "NOT_FOUND" };

  const location = await ensureGlobalStockLocation();

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const item of order.items) {
          const ref = saleRef(orderId, item.productId, item.variantId);
          const existing = await tx.stockMovement.findFirst({
            where: { externalReference: ref },
          });
          if (existing) continue;

          let level = item.variantId
            ? await tx.stockLevel.findFirst({
                where: {
                  productId: item.productId,
                  variantId: item.variantId,
                  locationId: location.id,
                },
              })
            : await tx.stockLevel.findFirst({
                where: { productId: item.productId, locationId: location.id },
                orderBy: { updatedAt: "desc" },
              });

          if (!level) {
            // Fallback : décrément legacy produit uniquement si pas de level
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product || product.stock < item.quantity) {
              throw new Error("STOCK_INSUFFICIENT");
            }
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stock: { decrement: item.quantity },
                salesCount: { increment: item.quantity },
              },
            });
            if (item.variantId) {
              await tx.productVariant.updateMany({
                where: { id: item.variantId, stock: { gte: item.quantity } },
                data: { stock: { decrement: item.quantity } },
              });
            }
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                variantId: item.variantId,
                locationId: location.id,
                movementType: "SALE",
                quantityBefore: product.stock,
                quantityChange: -item.quantity,
                quantityAfter: product.stock - item.quantity,
                source: "ecommerce_sale",
                externalReference: ref,
              },
            });
            continue;
          }

          // Quantité physique doit couvrir ; réservation déjà posée
          const updated = await tx.stockLevel.updateMany({
            where: {
              id: level.id,
              quantity: { gte: item.quantity },
            },
            data: {
              quantity: { decrement: item.quantity },
              reservedQuantity: { decrement: Math.min(item.quantity, level.reservedQuantity) },
            },
          });
          if (updated.count !== 1) {
            throw new Error("STOCK_INSUFFICIENT");
          }

          const after = await tx.stockLevel.findUniqueOrThrow({ where: { id: level.id } });
          const available = computeAvailable(after.quantity, after.reservedQuantity);
          await tx.stockLevel.update({
            where: { id: after.id },
            data: { availableQuantity: available, lastSyncedAt: new Date(), source: "ecommerce_sale" },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              variantId: after.variantId,
              locationId: location.id,
              movementType: "SALE",
              quantityBefore: level.quantity,
              quantityChange: -item.quantity,
              quantityAfter: after.quantity,
              source: "ecommerce_sale",
              externalReference: ref,
            },
          });

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: after.quantity,
              salesCount: { increment: item.quantity },
            },
          });
          await tx.productVariant.updateMany({
            where: { id: after.variantId },
            data: { stock: after.quantity },
          });

          // Alerte post-vente (hors tx critique — fire after)
        }
      },
      { isolationLevel: "Serializable" }
    );

    // Alertes après commit
    for (const item of order.items) {
      const snap = await resolveAvailability(item.productId, item.variantId);
      await maybeEmitStockAlerts(snap);
    }

    await logStockEvent({
      type: "SALE_COMMITTED",
      message: `Vente confirmée ${orderId}`,
      meta: { orderId },
    });

    return { ok: true, message: "Stock mis à jour" };
  } catch {
    await logStockEvent({
      type: "SALE_FAILED",
      message: "Échec commit stock après paiement",
      meta: { orderId },
    });
    return { ok: false, message: "STOCK_INSUFFICIENT" };
  }
}

export async function revalidateOrderStock(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    return {
      ok: false as const,
      message: "Commande introuvable",
      code: "NOT_FOUND" as const,
      lines: [] as ValidateStockResult["lines"],
    };
  }

  // Si réservation active : contrôler le stock physique (quantity), pas available
  // (available exclut déjà notre réservation).
  const location = await ensureGlobalStockLocation();
  const lines: ValidateStockResult["lines"] = [];
  let ok = true;
  let message = "Stock disponible";
  let code: ValidateStockResult["code"];

  for (const item of order.items) {
    const reserveExisting = await prisma.stockMovement.findFirst({
      where: {
        movementType: "RESERVE",
        externalReference: reserveRef(orderId, item.productId, item.variantId),
      },
    });

    const level = item.variantId
      ? await prisma.stockLevel.findFirst({
          where: {
            productId: item.productId,
            variantId: item.variantId,
            locationId: location.id,
          },
        })
      : await prisma.stockLevel.findFirst({
          where: { productId: item.productId, locationId: location.id },
          orderBy: { updatedAt: "desc" },
        });

    let available: number;
    let known = true;
    let status: StockStatus = "EN_STOCK";
    let name = item.productId;

    if (level) {
      available = reserveExisting
        ? level.quantity
        : computeAvailable(level.quantity, level.reservedQuantity);
      if (available <= 0) status = "RUPTURE";
      else if (available <= 5) status = "STOCK_FAIBLE";
    } else {
      const snap = await resolveAvailability(item.productId, item.variantId);
      available = snap.available;
      known = snap.known;
      status = snap.status;
      name = snap.productName || name;
    }

    const lineOk = available >= item.quantity && available > 0;
    if (available <= 0) {
      ok = false;
      code = "STOCK_INSUFFICIENT";
      message = "Désolé, un ou plusieurs produits ne sont plus disponibles.";
    } else if (!lineOk) {
      ok = false;
      code = "STOCK_INSUFFICIENT";
      message =
        `Quantité limitée : ${available} disponible(s) pour « ${name} ».`;
    } else if (!known && available < item.quantity) {
      ok = false;
      code = "STOCK_UNKNOWN";
      message =
        "Le stock est en cours de vérification. Merci de réessayer dans quelques instants.";
    }

    lines.push({
      productId: item.productId,
      variantId: item.variantId,
      requested: item.quantity,
      available,
      ok: lineOk,
      name,
      status,
    });
  }

  return { ok, code: ok ? undefined : code, message, lines };
}

/** Exposé pour tests concurrentiels */
export async function _forceReserveInTx(
  tx: Tx,
  levelId: string,
  quantity: number
): Promise<boolean> {
  const updated = await tx.stockLevel.updateMany({
    where: { id: levelId, availableQuantity: { gte: quantity } },
    data: {
      reservedQuantity: { increment: quantity },
      availableQuantity: { decrement: quantity },
    },
  });
  return updated.count === 1;
}
