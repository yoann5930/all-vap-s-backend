import prisma from "@/lib/prisma";
import {
  GLOBAL_STOCK_CODE,
  GLOBAL_STOCK_NAME,
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  STORE_STOCK_CODES,
  STOCK_LOCATION_SEED,
  stockCodeDisplayName,
  storeIdToStockCode,
  type StoreStockCode,
} from "@/lib/catalog/normalize";

export type StockStatus =
  | "EN_STOCK"
  | "STOCK_FAIBLE"
  | "RUPTURE"
  | "INCONNU"
  | "SYNCHRONISATION_EN_ERREUR";

export interface StoreStockSnapshot {
  productId: string;
  variantId: string | null;
  locationCode: StoreStockCode;
  locationName: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  source: string;
  lastSyncedAt: Date | null;
  status: StockStatus;
  known: boolean;
}

export interface DualStockSnapshot {
  productId: string;
  hautmont: StoreStockSnapshot;
  leQuesnoy: StoreStockSnapshot;
  /** Somme calculée des deux boutiques — jamais un 3ᵉ emplacement writable */
  global: {
    quantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    status: StockStatus;
    known: boolean;
  };
}

/** Alias rétrocompat — représente le stock global *calculé* */
export type GlobalStockSnapshot = {
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
};

/**
 * Active HAUTMONT + LE_QUESNOY et désactive GLOBAL_ALL_VAPS.
 * Plus aucune écriture sur l'emplacement legacy.
 */
export async function ensureStoreStockLocations() {
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
        address: loc.address,
        active: true,
      },
    });
  }

  await prisma.stockLocation.upsert({
    where: { code: GLOBAL_STOCK_CODE },
    create: {
      code: GLOBAL_STOCK_CODE,
      name: GLOBAL_STOCK_NAME,
      address: null,
      active: false,
    },
    update: {
      name: GLOBAL_STOCK_NAME,
      active: false,
    },
  });

  return prisma.stockLocation.findMany({
    where: { code: { in: [...STORE_STOCK_CODES] } },
  });
}

/** @deprecated utiliser ensureStoreStockLocations — retourne Hautmont pour compat API */
export async function ensureGlobalStockLocation() {
  await ensureStoreStockLocations();
  return prisma.stockLocation.findUniqueOrThrow({ where: { code: HAUTMONT_STOCK_CODE } });
}

export async function getStoreLocationOrThrow(code: StoreStockCode) {
  await ensureStoreStockLocations();
  return prisma.stockLocation.findUniqueOrThrow({ where: { code } });
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

function emptyStoreSnapshot(productId: string, code: StoreStockCode): StoreStockSnapshot {
  return {
    productId,
    variantId: null,
    locationCode: code,
    locationName: stockCodeDisplayName(code),
    quantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
    lowStockThreshold: 3,
    source: "unknown",
    lastSyncedAt: null,
    known: false,
    status: "INCONNU",
  };
}

async function readStoreLevel(
  productId: string,
  code: StoreStockCode
): Promise<StoreStockSnapshot> {
  const location = await prisma.stockLocation.findUnique({ where: { code } });
  if (!location) return emptyStoreSnapshot(productId, code);

  const level = await prisma.stockLevel.findFirst({
    where: { productId, locationId: location.id },
    orderBy: { updatedAt: "desc" },
  });

  if (!level) return emptyStoreSnapshot(productId, code);

  const available = computeAvailable(level.quantity, level.reservedQuantity);
  return {
    productId,
    variantId: level.variantId,
    locationCode: code,
    locationName: stockCodeDisplayName(code),
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

export async function getStoreStock(
  productId: string,
  code: StoreStockCode
): Promise<StoreStockSnapshot> {
  return readStoreLevel(productId, code);
}

export async function getDualStockForProduct(productId: string): Promise<DualStockSnapshot> {
  const [hautmont, leQuesnoy] = await Promise.all([
    readStoreLevel(productId, HAUTMONT_STOCK_CODE),
    readStoreLevel(productId, LE_QUESNOY_STOCK_CODE),
  ]);

  const quantity = hautmont.quantity + leQuesnoy.quantity;
  const reservedQuantity = hautmont.reservedQuantity + leQuesnoy.reservedQuantity;
  const availableQuantity = hautmont.availableQuantity + leQuesnoy.availableQuantity;
  const known = hautmont.known || leQuesnoy.known;
  const threshold = Math.min(hautmont.lowStockThreshold, leQuesnoy.lowStockThreshold);

  return {
    productId,
    hautmont,
    leQuesnoy,
    global: {
      quantity,
      reservedQuantity,
      availableQuantity,
      known,
      status: stockStatusFromLevel({
        known,
        availableQuantity,
        lowStockThreshold: threshold,
      }),
    },
  };
}

/** Stock global = somme calculée des deux boutiques */
export async function getGlobalStockForProduct(productId: string): Promise<GlobalStockSnapshot> {
  const dual = await getDualStockForProduct(productId);
  if (!dual.global.known) {
    const legacy = await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    });
    if (legacy) {
      const qty = legacy.stock;
      return {
        productId,
        variantId: null,
        quantity: qty,
        reservedQuantity: 0,
        availableQuantity: qty,
        lowStockThreshold: 3,
        source: "legacy",
        lastSyncedAt: null,
        known: true,
        status: stockStatusFromLevel({
          known: true,
          availableQuantity: qty,
          lowStockThreshold: 3,
        }),
      };
    }
  }

  const prefer = dual.hautmont.known ? dual.hautmont : dual.leQuesnoy;
  return {
    productId,
    variantId: prefer.variantId,
    quantity: dual.global.quantity,
    reservedQuantity: dual.global.reservedQuantity,
    availableQuantity: dual.global.availableQuantity,
    lowStockThreshold: prefer.lowStockThreshold,
    source: "dual_sum",
    lastSyncedAt: prefer.lastSyncedAt,
    known: dual.global.known,
    status: dual.global.status,
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

/** Recalcule Product.stock = somme HAUTMONT + LE_QUESNOY */
export async function syncProductStockMirror(productId: string): Promise<number> {
  const dual = await getDualStockForProduct(productId);
  const total = dual.global.quantity;
  await prisma.product.update({
    where: { id: productId },
    data: { stock: total },
  });
  return total;
}

export async function setStoreStockQuantity(params: {
  productId: string;
  variantId: string;
  locationCode: StoreStockCode;
  quantity: number;
  source: string;
  movementType?: string;
  externalReference?: string;
}): Promise<{ before: number; after: number }> {
  const location = await getStoreLocationOrThrow(params.locationCode);
  const existing = await prisma.stockLevel.findUnique({
    where: {
      variantId_locationId: {
        variantId: params.variantId,
        locationId: location.id,
      },
    },
  });

  const before = existing?.quantity ?? 0;
  const after = Math.max(0, params.quantity);
  const reserved = Math.min(existing?.reservedQuantity ?? 0, after);
  const available = computeAvailable(after, reserved);

  await prisma.$transaction([
    prisma.stockLevel.upsert({
      where: {
        variantId_locationId: {
          variantId: params.variantId,
          locationId: location.id,
        },
      },
      create: {
        productId: params.productId,
        variantId: params.variantId,
        locationId: location.id,
        quantity: after,
        reservedQuantity: 0,
        availableQuantity: after,
        source: params.source,
        lastSyncedAt: new Date(),
      },
      update: {
        quantity: after,
        reservedQuantity: reserved,
        availableQuantity: available,
        source: params.source,
        lastSyncedAt: new Date(),
      },
    }),
    prisma.stockMovement.create({
      data: {
        productId: params.productId,
        variantId: params.variantId,
        locationId: location.id,
        movementType: params.movementType || "SYNC_SET",
        quantityBefore: before,
        quantityChange: after - before,
        quantityAfter: after,
        source: params.source,
        externalReference: params.externalReference,
      },
    }),
  ]);

  await syncProductStockMirror(params.productId);
  return { before, after };
}

/**
 * Réserve du stock sur une boutique.
 * Si locationCode omis : utilise pickupStoreId mappé, sinon Hautmont (défaut documenté).
 */
export async function reserveStoreStock(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  locationCode?: StoreStockCode;
  pickupStoreId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  if (params.quantity <= 0) return { ok: false, message: "Quantité invalide" };

  const existing = await prisma.stockMovement.findFirst({
    where: { externalReference: params.externalReference, movementType: "RESERVE" },
  });
  if (existing) return { ok: true, message: "Réservation déjà enregistrée (idempotent)" };

  const code = params.locationCode || storeIdToStockCode(params.pickupStoreId);
  const location = await getStoreLocationOrThrow(code);
  const level = await prisma.stockLevel.findFirst({
    where: { productId: params.productId, locationId: location.id },
  });
  if (!level) {
    return { ok: false, message: "Stock boutique inconnu — réservation refusée" };
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

  return { ok: true, message: `Réservé sur ${code}` };
}

/** @deprecated alias → reserveStoreStock (défaut Hautmont) */
export async function reserveGlobalStock(params: {
  productId: string;
  quantity: number;
  externalReference: string;
}): Promise<{ ok: boolean; message: string }> {
  return reserveStoreStock(params);
}

export async function releaseStoreReservation(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  locationCode?: StoreStockCode;
  pickupStoreId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const releaseRef = `release:${params.externalReference}`;
  const already = await prisma.stockMovement.findFirst({
    where: { externalReference: releaseRef, movementType: "RELEASE" },
  });
  if (already) return { ok: true, message: "Libération déjà enregistrée" };

  const code = params.locationCode || storeIdToStockCode(params.pickupStoreId);
  const location = await getStoreLocationOrThrow(code);
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

export async function releaseGlobalReservation(params: {
  productId: string;
  quantity: number;
  externalReference: string;
}): Promise<{ ok: boolean; message: string }> {
  return releaseStoreReservation(params);
}

/**
 * Vente e-commerce / SumUp sur une boutique.
 * Défaut documenté : sans boutique précisée → Hautmont.
 * Miroir Product.stock = somme des deux boutiques.
 */
export async function applyStoreSale(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  source?: string;
  locationCode?: StoreStockCode;
  pickupStoreId?: string | null;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  if (params.quantity <= 0) return { ok: false, message: "Quantité invalide" };

  const existing = await prisma.stockMovement.findFirst({
    where: { externalReference: params.externalReference },
  });
  if (existing) {
    return { ok: true, message: "Transaction déjà traitée", duplicate: true };
  }

  const code = params.locationCode || storeIdToStockCode(params.pickupStoreId);
  const location = await getStoreLocationOrThrow(code);
  const level = await prisma.stockLevel.findFirst({
    where: { productId: params.productId, locationId: location.id },
  });
  if (!level) {
    return { ok: false, message: `Produit sans stock ${code} — aucun mouvement` };
  }

  const before = level.quantity;
  const after = Math.max(0, before - params.quantity);
  const reserved = Math.min(level.reservedQuantity, after);
  const availableAfter = computeAvailable(after, reserved);

  await prisma.$transaction([
    prisma.stockLevel.update({
      where: { id: level.id },
      data: {
        quantity: after,
        reservedQuantity: reserved,
        availableQuantity: availableAfter,
        source: params.source || "sale",
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
        source: params.source || "sale",
        externalReference: params.externalReference,
      },
    }),
  ]);

  const total = await syncProductStockMirror(params.productId);
  return {
    ok: true,
    message: `Stock ${code} ${before} → ${after} (global calculé ${total})`,
  };
}

/** @deprecated alias → applyStoreSale (défaut Hautmont) */
export async function applyGlobalSale(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  source?: string;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  return applyStoreSale(params);
}

export async function applyStoreRefund(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  source?: string;
  locationCode?: StoreStockCode;
  pickupStoreId?: string | null;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  if (params.quantity <= 0) return { ok: false, message: "Quantité invalide" };

  const existing = await prisma.stockMovement.findFirst({
    where: { externalReference: params.externalReference },
  });
  if (existing) {
    return { ok: true, message: "Remboursement déjà traité", duplicate: true };
  }

  const code = params.locationCode || storeIdToStockCode(params.pickupStoreId);
  const location = await getStoreLocationOrThrow(code);
  const level = await prisma.stockLevel.findFirst({
    where: { productId: params.productId, locationId: location.id },
  });
  if (!level) {
    return { ok: false, message: `Produit sans stock ${code} — remboursement non appliqué` };
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
  ]);

  const total = await syncProductStockMirror(params.productId);
  return {
    ok: true,
    message: `Stock ${code} ${before} → ${after} (global calculé ${total}, remboursement)`,
  };
}

/** @deprecated alias → applyStoreRefund (défaut Hautmont) */
export async function applyGlobalRefund(params: {
  productId: string;
  quantity: number;
  externalReference: string;
  source?: string;
}): Promise<{ ok: boolean; message: string; duplicate?: boolean }> {
  return applyStoreRefund(params);
}

export {
  GLOBAL_STOCK_CODE,
  GLOBAL_STOCK_NAME,
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  STORE_STOCK_CODES,
};
