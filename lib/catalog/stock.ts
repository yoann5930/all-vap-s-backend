import prisma from "@/lib/prisma";
import {
  GLOBAL_STOCK_CODE,
  GLOBAL_STOCK_NAME,
  STOCK_LOCATION_SEED,
} from "@/lib/catalog/normalize";

export type StockStatus =
  | "EN_STOCK"
  | "STOCK_FAIBLE"
  | "RUPTURE"
  | "INCONNU"
  | "SYNCHRONISATION_EN_ERREUR";

export interface GlobalStockSnapshot {
  productId: string;
  variantId: string | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  source: string;
  lastSyncedAt: Date | null;
  status: StockStatus;
  known: boolean;
}

export async function ensureGlobalStockLocation() {
  for (const loc of STOCK_LOCATION_SEED) {
    await prisma.stockLocation.upsert({
      where: { code: loc.code },
      create: {
        code: loc.code,
        name: loc.name,
        address: loc.address,
        active: true,
      },
      update: {
        name: loc.name,
        active: true,
      },
    });
  }

  // Désactiver d'anciens emplacements multi-boutiques s'ils existent en local
  await prisma.stockLocation.updateMany({
    where: { code: { in: ["HAUTMONT", "LE_QUESNOY"] } },
    data: { active: false },
  });

  return prisma.stockLocation.findUniqueOrThrow({ where: { code: GLOBAL_STOCK_CODE } });
}

export function computeAvailable(quantity: number, reservedQuantity: number): number {
  return Math.max(0, quantity - reservedQuantity);
}

export function stockStatusFromLevel(params: {
  known: boolean;
  availableQuantity: number;
  lowStockThreshold: number;
  syncError?: boolean;
}): StockStatus {
  if (params.syncError) return "SYNCHRONISATION_EN_ERREUR";
  if (!params.known) return "INCONNU";
  if (params.availableQuantity <= 0) return "RUPTURE";
  if (params.availableQuantity <= params.lowStockThreshold) return "STOCK_FAIBLE";
  return "EN_STOCK";
}

export async function getGlobalStockForProduct(productId: string): Promise<GlobalStockSnapshot> {
  const location = await prisma.stockLocation.findUnique({ where: { code: GLOBAL_STOCK_CODE } });
  if (!location) {
    const legacy = await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    });
    const qty = legacy?.stock ?? 0;
    return {
      productId,
      variantId: null,
      quantity: qty,
      reservedQuantity: 0,
      availableQuantity: qty,
      lowStockThreshold: 3,
      source: "legacy",
      lastSyncedAt: null,
      known: legacy != null,
      status: stockStatusFromLevel({
        known: legacy != null,
        availableQuantity: qty,
        lowStockThreshold: 3,
      }),
    };
  }

  const level = await prisma.stockLevel.findFirst({
    where: { productId, locationId: location.id },
    orderBy: { updatedAt: "desc" },
  });

  if (!level) {
    // Miroir e-commerce (Product / Variant) — ne pas bloquer en « à confirmer »
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        stock: true,
        variants: {
          where: { active: true },
          select: { id: true, stock: true },
          orderBy: { stock: "desc" },
        },
      },
    });
    const bestVariant = product?.variants?.[0];
    const qty = Math.max(0, bestVariant?.stock ?? product?.stock ?? 0);
    const known = product != null;
    return {
      productId,
      variantId: bestVariant?.id ?? null,
      quantity: qty,
      reservedQuantity: 0,
      availableQuantity: qty,
      lowStockThreshold: 3,
      source: "legacy_mirror",
      lastSyncedAt: null,
      known,
      status: stockStatusFromLevel({
        known,
        availableQuantity: qty,
        lowStockThreshold: 3,
      }),
    };
  }

  const available = computeAvailable(level.quantity, level.reservedQuantity);
  return {
    productId,
    variantId: level.variantId,
    quantity: level.quantity,
    reservedQuantity: level.reservedQuantity,
    availableQuantity: available,
    lowStockThreshold: level.lowStockThreshold,
    source: level.source,
    lastSyncedAt: level.lastSyncedAt,
    known: true,
    status: stockStatusFromLevel({
      known: true,
      availableQuantity: available,
      lowStockThreshold: level.lowStockThreshold,
    }),
  };
}

export function avaAvailabilityPhrase(snapshot: GlobalStockSnapshot): string {
  if (!snapshot.known || snapshot.status === "INCONNU") {
    return "Je ne peux pas confirmer la disponibilité de ce produit pour le moment.";
  }
  if (snapshot.availableQuantity <= 0 || snapshot.status === "RUPTURE") {
    return "Ce produit est actuellement en rupture.";
  }
  return "Ce produit est disponible chez All Vap's.";
}

/**
 * Réserve du stock général. Empêche de dépasser availableQuantity.
 * Retourne false si insuffisant.
 */
export async function reserveGlobalStock(params: {
  productId: string;
  quantity: number;
  externalReference: string;
}): Promise<{ ok: boolean; message: string }> {
  if (params.quantity <= 0) return { ok: false, message: "Quantité invalide" };

  const existing = await prisma.stockMovement.findFirst({
    where: { externalReference: params.externalReference, movementType: "RESERVE" },
  });
  if (existing) return { ok: true, message: "Réservation déjà enregistrée (idempotent)" };

  const location = await ensureGlobalStockLocation();
  const level = await prisma.stockLevel.findFirst({
    where: { productId: params.productId, locationId: location.id },
  });
  if (!level) {
    return { ok: false, message: "Stock inconnu — réservation refusée" };
  }

  const available = computeAvailable(level.quantity, level.reservedQuantity);
  if (params.quantity > available) {
    return { ok: false, message: "Stock insuffisant" };
  }

  const reserved = level.reservedQuantity + params.quantity;
  const availableAfter = computeAvailable(level.quantity, reserved);

  await prisma.$transaction([
    prisma.stockLevel.update({
      where: { id: level.id },
      data: {
        reservedQuantity: reserved,
        availableQuantity: availableAfter,
      },
    }),
    prisma.stockMovement.create({
      data: {
        productId: params.productId,
        variantId: level.variantId,
        locationId: location.id,
        movementType: "RESERVE",
        quantityBefore: level.quantity,
        quantityChange: 0,
        quantityAfter: level.quantity,
        source: "ecommerce",
        externalReference: params.externalReference,
      },
    }),
  ]);

  return { ok: true, message: "Réservé" };
}

export async function releaseGlobalReservation(params: {
  productId: string;
  quantity: number;
  externalReference: string;
}): Promise<{ ok: boolean; message: string }> {
  const releaseRef = `release:${params.externalReference}`;
  const already = await prisma.stockMovement.findFirst({
    where: { externalReference: releaseRef, movementType: "RELEASE" },
  });
  if (already) return { ok: true, message: "Libération déjà enregistrée" };

  const location = await ensureGlobalStockLocation();
  const level = await prisma.stockLevel.findFirst({
    where: { productId: params.productId, locationId: location.id },
  });
  if (!level) return { ok: false, message: "Stock inconnu" };

  const reserved = Math.max(0, level.reservedQuantity - params.quantity);
  const availableAfter = computeAvailable(level.quantity, reserved);

  await prisma.$transaction([
    prisma.stockLevel.update({
      where: { id: level.id },
      data: { reservedQuantity: reserved, availableQuantity: availableAfter },
    }),
    prisma.stockMovement.create({
      data: {
        productId: params.productId,
        variantId: level.variantId,
        locationId: location.id,
        movementType: "RELEASE",
        quantityBefore: level.quantity,
        quantityChange: 0,
        quantityAfter: level.quantity,
        source: "ecommerce",
        externalReference: releaseRef,
      },
    }),
  ]);

  return { ok: true, message: "Réservation libérée" };
}

/**
 * Crée un StockLevel GLOBAL si absent (miroir Product / ProductVariant).
 * Nécessaire pour appliquer les ventes SumUp sur le catalogue publié.
 */
export async function ensureProductGlobalStockLevel(productId: string) {
  const location = await ensureGlobalStockLocation();
  const existing = await prisma.stockLevel.findFirst({
    where: { productId, locationId: location.id },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!product) return null;

  let variant = product.variants[0];
  if (!variant) {
    variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: "Standard",
        stock: product.stock,
        active: true,
      },
    });
  }

  const qty = Math.max(0, variant.stock ?? product.stock ?? 0);
  return prisma.stockLevel.create({
    data: {
      productId: product.id,
      variantId: variant.id,
      locationId: location.id,
      quantity: qty,
      reservedQuantity: 0,
      availableQuantity: qty,
      lowStockThreshold: 5,
      source: "sumup_bootstrap",
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Vente SumUp / e-commerce : diminue le stock général une seule fois (idempotent via externalReference).
 * Ne remet PAS automatiquement en stock un remboursement.
 */
export async function applyGlobalSale(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  source?: string;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  if (params.quantity <= 0) return { ok: false, message: "Quantité invalide" };

  const existing = await prisma.stockMovement.findFirst({
    where: { externalReference: params.externalReference },
  });
  if (existing) {
    return { ok: true, message: "Transaction déjà traitée", duplicate: true };
  }

  const location = await ensureGlobalStockLocation();
  const level = await ensureProductGlobalStockLevel(params.productId);
  if (!level) {
    return { ok: false, message: "Produit introuvable — aucun mouvement" };
  }

  const before = level.quantity;
  const after = Math.max(0, before - params.quantity);
  if (after === before && params.quantity > 0 && before === 0) {
    // Pas de stock négatif silencieux : on journalise à 0
  }
  const reserved = Math.min(level.reservedQuantity, after);
  const availableAfter = computeAvailable(after, reserved);

  await prisma.$transaction([
    prisma.stockLevel.update({
      where: { id: level.id },
      data: {
        quantity: after,
        reservedQuantity: reserved,
        availableQuantity: availableAfter,
        source: params.source || "sumup_sale",
        lastSyncedAt: new Date(),
      },
    }),
    prisma.stockMovement.create({
      data: {
        productId: params.productId,
        variantId: level.variantId,
        locationId: location.id,
        movementType: "SALE",
        quantityBefore: before,
        quantityChange: after - before,
        quantityAfter: after,
        source: params.source || "sumup_sale",
        externalReference: params.externalReference,
      },
    }),
    // Miroir legacy e-commerce
    prisma.product.update({
      where: { id: params.productId },
      data: { stock: after },
    }),
  ]);

  if (level.variantId) {
    await prisma.productVariant.updateMany({
      where: { id: level.variantId },
      data: { stock: after },
    });
  }

  return { ok: true, message: `Stock général ${before} → ${after}` };
}

/**
 * Remboursement SumUp : réintègre le stock général si produit identifié (idempotent).
 */
export async function applyGlobalRefund(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  source?: string;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  if (params.quantity <= 0) return { ok: false, message: "Quantité invalide" };

  const existing = await prisma.stockMovement.findFirst({
    where: { externalReference: params.externalReference },
  });
  if (existing) {
    return { ok: true, message: "Remboursement déjà traité", duplicate: true };
  }

  const location = await ensureGlobalStockLocation();
  const level = await ensureProductGlobalStockLevel(params.productId);
  if (!level) {
    return { ok: false, message: "Produit introuvable — remboursement non appliqué" };
  }

  const before = level.quantity;
  const after = before + params.quantity;
  const availableAfter = computeAvailable(after, level.reservedQuantity);

  await prisma.$transaction([
    prisma.stockLevel.update({
      where: { id: level.id },
      data: {
        quantity: after,
        availableQuantity: availableAfter,
        source: params.source || "sumup_refund",
        lastSyncedAt: new Date(),
      },
    }),
    prisma.stockMovement.create({
      data: {
        productId: params.productId,
        variantId: level.variantId,
        locationId: location.id,
        movementType: "REFUND",
        quantityBefore: before,
        quantityChange: params.quantity,
        quantityAfter: after,
        source: params.source || "sumup_refund",
        externalReference: params.externalReference,
      },
    }),
    prisma.product.update({
      where: { id: params.productId },
      data: { stock: after, sumupLastSync: new Date() },
    }),
  ]);

  return { ok: true, message: `Stock général ${before} → ${after} (remboursement)` };
}

export { GLOBAL_STOCK_CODE, GLOBAL_STOCK_NAME };
