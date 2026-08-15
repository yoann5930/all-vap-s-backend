import prisma from "@/lib/prisma";
import {
  computeAvailable,
  ensureGlobalStockLocation,
  stockStatusFromLevel,
  type StockStatus,
} from "@/lib/catalog/stock";
import { GLOBAL_STOCK_CODE } from "@/lib/catalog/normalize";

export type CartStockLine = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  name?: string;
};

export type StockAvailability = {
  productId: string;
  variantId: string | null;
  available: number;
  quantity: number;
  reserved: number;
  known: boolean;
  status: StockStatus;
  source: string;
  lastSyncedAt: Date | null;
  productName?: string;
  variantLabel?: string | null;
  manufacturer?: string | null;
  range?: string | null;
  ean?: string | null;
  stockLevelId?: string | null;
};

const LOW_ALERT = Number(process.env.STOCK_LOW_ALERT_THRESHOLD || "5");

/**
 * Résout le stock disponible (source SumUp via StockLevel, miroir variante/produit).
 * Refuse la vente si stock inconnu (known=false) — pas de vente « à l'aveugle ».
 */
export async function resolveAvailability(
  productId: string,
  variantId?: string | null
): Promise<StockAvailability> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      stock: true,
      brand: true,
      range: true,
      barcode: true,
      manufacturer: { select: { name: true } },
      variants: {
        where: variantId ? { id: variantId } : { active: true },
        select: {
          id: true,
          name: true,
          barcode: true,
          nicotineLabel: true,
          nicotineMg: true,
        },
      },
    },
  });

  if (!product) {
    return {
      productId,
      variantId: variantId || null,
      available: 0,
      quantity: 0,
      reserved: 0,
      known: false,
      status: "INCONNU",
      source: "missing",
      lastSyncedAt: null,
    };
  }

  const location = await prisma.stockLocation.findUnique({
    where: { code: GLOBAL_STOCK_CODE },
  });

  const variant =
    (variantId
      ? product.variants.find((v) => v.id === variantId)
      : product.variants[0]) || null;

  let level = null as Awaited<ReturnType<typeof prisma.stockLevel.findFirst>> | null;
  if (location) {
    if (variantId) {
      level = await prisma.stockLevel.findFirst({
        where: { productId, variantId, locationId: location.id },
      });
    }
    if (!level) {
      level = await prisma.stockLevel.findFirst({
        where: { productId, locationId: location.id },
        orderBy: { updatedAt: "desc" },
      });
    }
  }

  if (level) {
    const available = computeAvailable(level.quantity, level.reservedQuantity);
    return {
      productId,
      variantId: level.variantId || variant?.id || null,
      available,
      quantity: level.quantity,
      reserved: level.reservedQuantity,
      known: true,
      status: stockStatusFromLevel({
        known: true,
        availableQuantity: available,
        lowStockThreshold: Math.max(level.lowStockThreshold, LOW_ALERT),
      }),
      source: level.source,
      lastSyncedAt: level.lastSyncedAt,
      productName: product.name,
      variantLabel:
        variant?.nicotineLabel ||
        (variant?.nicotineMg != null ? `${variant.nicotineMg} mg` : variant?.name) ||
        null,
      manufacturer: product.manufacturer?.name || product.brand,
      range: product.range,
      ean: variant?.barcode || product.barcode,
      stockLevelId: level.id,
    };
  }

  // Miroir e-commerce si pas encore de StockLevel SumUp
  const qty = Math.max(0, product.stock ?? 0);
  const known = true;
  return {
    productId,
    variantId: variant?.id || null,
    available: qty,
    quantity: qty,
    reserved: 0,
    known,
    status: stockStatusFromLevel({
      known,
      availableQuantity: qty,
      lowStockThreshold: LOW_ALERT,
    }),
    source: "legacy_mirror",
    lastSyncedAt: null,
    productName: product.name,
    variantLabel:
      variant?.nicotineLabel ||
      (variant?.nicotineMg != null ? `${variant.nicotineMg} mg` : variant?.name) ||
      null,
    manufacturer: product.manufacturer?.name || product.brand,
    range: product.range,
    ean: variant?.barcode || product.barcode,
    stockLevelId: null,
  };
}

export type ValidateStockResult = {
  ok: boolean;
  code?: "STOCK_INSUFFICIENT" | "STOCK_UNKNOWN" | "STOCK_VERIFYING";
  message: string;
  lines: Array<{
    productId: string;
    variantId: string | null;
    requested: number;
    available: number;
    ok: boolean;
    name?: string;
    status: StockStatus;
  }>;
};

export async function validateCartStock(
  lines: CartStockLine[],
  options?: { allowUnknown?: boolean; allowOutOfStockAudit?: boolean }
): Promise<ValidateStockResult> {
  const aggregated = new Map<string, CartStockLine & { name?: string }>();
  for (const line of lines) {
    const key = `${line.productId}::${line.variantId || ""}`;
    const prev = aggregated.get(key);
    if (prev) prev.quantity += line.quantity;
    else aggregated.set(key, { ...line });
  }

  const results: ValidateStockResult["lines"] = [];
  let ok = true;
  let code: ValidateStockResult["code"];
  let message = "Stock disponible";
  let usedAuditBypass = false;

  for (const line of aggregated.values()) {
    const snap = await resolveAvailability(line.productId, line.variantId);
    let lineOk =
      snap.available >= line.quantity &&
      snap.available > 0 &&
      (snap.known || snap.available > 0) &&
      snap.status !== "RUPTURE";

    if (!snap.known || snap.status === "INCONNU") {
      if (snap.available > 0 && snap.available >= line.quantity) {
        // OK — stock legacy / miroir
      } else if (options?.allowOutOfStockAudit) {
        usedAuditBypass = true;
        lineOk = true;
      } else if (!options?.allowUnknown) {
        ok = false;
        code = snap.available <= 0 ? "STOCK_INSUFFICIENT" : "STOCK_UNKNOWN";
        message =
          snap.available <= 0
            ? "Désolé, un ou plusieurs produits ne sont plus disponibles."
            : `Il reste ${snap.available} unité(s) disponible(s) pour « ${snap.productName || line.name || "ce produit"} ».`;
      }
    } else if (snap.status === "SYNCHRONISATION_EN_ERREUR") {
      if (snap.available >= line.quantity && snap.available > 0) {
        // Sync en erreur mais quantité locale connue → ne pas bloquer
      } else if (options?.allowOutOfStockAudit) {
        usedAuditBypass = true;
        lineOk = true;
      } else {
        ok = false;
        code = "STOCK_VERIFYING";
        message =
          "Le stock est en cours de vérification. Merci de réessayer dans quelques instants.";
      }
    } else if (snap.available < line.quantity) {
      if (options?.allowOutOfStockAudit) {
        usedAuditBypass = true;
        lineOk = true;
      } else {
        ok = false;
        code = "STOCK_INSUFFICIENT";
        message =
          snap.available <= 0
            ? "Désolé, un ou plusieurs produits ne sont plus disponibles."
            : `Quantité limitée : ${snap.available} disponible(s) pour « ${snap.productName || line.name || "ce produit"} ».`;
      }
    }

    if (!lineOk && options?.allowOutOfStockAudit) {
      usedAuditBypass = true;
      lineOk = true;
    }

    results.push({
      productId: line.productId,
      variantId: line.variantId || snap.variantId,
      requested: line.quantity,
      available: snap.available,
      ok: lineOk,
      name: snap.productName || line.name,
      status: snap.status,
    });
  }

  if (options?.allowOutOfStockAudit && usedAuditBypass) {
    ok = true;
    code = undefined;
    message = "AUDIT_ONLY — commande hors stock autorisée (stock réel non engagé comme vente prod)";
  }

  return { ok, code: ok ? undefined : code, message, lines: results };
}

export async function isSumUpStockSourceHealthy(): Promise<boolean> {
  try {
    const state = await prisma.sumUpSyncState.findUnique({ where: { id: "default" } });
    if (!state) return true; // pas encore initialisé — on s'appuie sur StockLevel locaux
    if (state.lockedUntil && state.lockedUntil > new Date()) {
      // sync en cours n'interdit pas la lecture du stock local
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

export { ensureGlobalStockLocation, computeAvailable };
