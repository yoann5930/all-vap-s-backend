import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { matchCatalogProduct } from "@/lib/catalog/matching";
import { normalizeProductName } from "@/lib/catalog/normalize";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertStoreAllowed, requireInventoryAuth } from "@/lib/inventory/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { getDualStockForProduct } from "@/lib/catalog/stock";
import {
  assertValidUnitPriceCents,
  computeLineTotalCents,
  parseEuroPriceInput,
} from "@/lib/inventory/pricing";
import { resolveCatalogUnitPriceCents } from "@/lib/inventory/session-summary";
import { PRICE_SOURCES, type PriceSource } from "@/lib/inventory/status";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireInventoryAuth();
    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: {
        location: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        lines: {
          orderBy: { createdAt: "desc" },
          include: {
            product: true,
            photos: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (user.role !== "ADMIN" && session.createdByUserId && session.createdByUserId !== user.userId) {
      throw new Error("FORBIDDEN");
    }
    assertStoreAllowed(user, session.location.code);
    return jsonResponse({ session });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:line:${user.userId}`, 120, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de requêtes", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Session clôturée" }, 400);
    }
    if (user.role !== "ADMIN" && session.createdByUserId && session.createdByUserId !== user.userId) {
      throw new Error("FORBIDDEN");
    }
    assertStoreAllowed(user, session.location.code);

    const body = z
      .object({
        barcode: z.string().min(1).max(64).optional(),
        productId: z.string().optional(),
        quantityCounted: z.number().int().min(0),
        photoPath: z.string().optional(),
        notes: z.string().max(500).optional(),
        unitPriceCents: z.number().int().optional(),
        unitPrice: z.union([z.string(), z.number()]).optional(),
        priceSource: z.enum(PRICE_SOURCES).optional(),
        confirmZeroPrice: z.boolean().optional(),
        confirmHighAmount: z.boolean().optional(),
        allowCatalogPriceOverride: z.boolean().optional(),
      })
      .parse(await request.json());

    let productId = body.productId || null;
    let variantId: string | null = null;
    let barcode = body.barcode || null;
    let productNameSnapshot: string | null = null;
    let brandSnapshot: string | null = null;
    let rangeSnapshot: string | null = null;
    let categorySnapshot: string | null = null;
    let formatSnapshot: string | null = null;
    let nicotineSnapshot: string | null = null;
    let catalogImageUrl: string | null = null;
    let catalogPrice: { cents: number; source: PriceSource } | null = null;

    if (!productId && barcode) {
      const catalog = await prisma.product.findMany({
        select: {
          id: true,
          name: true,
          normalizedName: true,
          sku: true,
          barcode: true,
          sumupProductId: true,
          brand: true,
        },
      });
      const match = matchCatalogProduct(
        {
          name: barcode,
          normalizedName: normalizeProductName(barcode),
          barcode,
        },
        catalog
      );
      if (match.productId && match.decision === "AUTO") {
        productId = match.productId;
      }
    }

    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          variants: {
            where: { active: true },
            take: 1,
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (product) {
        productNameSnapshot = product.name;
        brandSnapshot = product.brand;
        rangeSnapshot = product.range;
        categorySnapshot = product.category;
        catalogImageUrl = product.imageUrl;
        catalogPrice = resolveCatalogUnitPriceCents(product);
        const variant = product.variants?.[0];
        variantId = variant?.id || null;
        if (variant) {
          formatSnapshot =
            variant.capacityMl != null
              ? `${variant.capacityMl} ml`
              : variant.size || variant.name || null;
          nicotineSnapshot =
            variant.nicotineLabel ||
            (variant.nicotineMg != null ? `${variant.nicotineMg} mg` : null);
        }
        if (!barcode) barcode = product.barcode || null;
      }
    }

    // Résolution prix
    let unitPriceCents: number | null = null;
    let priceSource: PriceSource | null = null;

    if (body.unitPriceCents != null) {
      unitPriceCents = body.unitPriceCents;
    } else if (body.unitPrice != null && body.unitPrice !== "") {
      const parsed = parseEuroPriceInput(body.unitPrice);
      if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
      unitPriceCents = parsed.cents;
    } else if (catalogPrice && catalogPrice.cents > 0) {
      unitPriceCents = catalogPrice.cents;
      priceSource = catalogPrice.source;
    }

    if (body.priceSource) {
      priceSource = body.priceSource;
    } else if (unitPriceCents != null && !priceSource) {
      priceSource = "SAISIE_MANUELLE";
    }

    // Employé : ne peut pas écraser un prix catalogue sans autorisation
    if (
      user.role !== "ADMIN" &&
      catalogPrice &&
      catalogPrice.cents > 0 &&
      unitPriceCents != null &&
      unitPriceCents !== catalogPrice.cents &&
      !body.allowCatalogPriceOverride
    ) {
      return jsonResponse(
        {
          error: "Prix catalogue non modifiable — contactez un administrateur",
          catalogPriceCents: catalogPrice.cents,
        },
        403
      );
    }

    if (unitPriceCents == null) {
      return jsonResponse(
        { error: "Prix manquant — saisissez le prix unitaire avant d’enregistrer" },
        400
      );
    }

    const priceCheck = assertValidUnitPriceCents(unitPriceCents, {
      allowZero: Boolean(body.confirmZeroPrice),
      confirmHighAmount: Boolean(body.confirmHighAmount),
    });
    if (!priceCheck.ok) {
      return jsonResponse({ error: priceCheck.error }, 400);
    }

    if (
      user.role === "ADMIN" &&
      catalogPrice &&
      unitPriceCents !== catalogPrice.cents
    ) {
      priceSource = "CORRECTION_ADMIN";
    }

    const totalValueCents = computeLineTotalCents(body.quantityCounted, unitPriceCents);
    const now = new Date();

    const line = await prisma.inventoryLine.create({
      data: {
        sessionId: id,
        productId,
        variantId,
        barcode,
        productNameSnapshot,
        brandSnapshot,
        rangeSnapshot,
        categorySnapshot,
        formatSnapshot,
        nicotineSnapshot,
        catalogImageUrl,
        quantityCounted: body.quantityCounted,
        unitPriceCents,
        totalValueCents,
        priceSource,
        photoPath: body.photoPath,
        scannedByUserId: user.userId,
        scannedAt: now,
        notes:
          body.notes ||
          `employé=${session.employeeName}; boutique=${session.location.code}; at=${now.toISOString()}`,
      },
      include: { product: true, photos: true },
    });

    let oldQty: number | null = null;
    if (productId) {
      try {
        const dual = await getDualStockForProduct(productId);
        oldQty =
          session.location.code === "LE_QUESNOY"
            ? dual.leQuesnoy.quantity
            : dual.hautmont.quantity;
      } catch {
        /* ignore */
      }
    }

    await writeAuditLog({
      user,
      action: "INVENTORY_LINE_UPSERT",
      storeCode: session.location.code,
      productId: productId || null,
      productName: line.productNameSnapshot || line.product?.name || null,
      inventoryId: id,
      sessionId: id,
      oldQuantity: oldQty,
      newQuantity: body.quantityCounted,
      ip,
      deviceInfo: request.headers.get("user-agent"),
      metadata: {
        barcode,
        lineId: line.id,
        unitPriceCents,
        priceSource,
        totalValueCents,
      },
    });

    await writeInventoryAudit({
      user,
      inventoryId: id,
      inventoryItemId: line.id,
      action: "LINE_CREATED",
      fieldName: "quantityCounted",
      oldValue: null,
      newValue: body.quantityCounted,
      reason: `prix=${unitPriceCents}; source=${priceSource}`,
    });

    return jsonResponse(
      {
        line,
        meta: {
          employeeName: session.employeeName,
          locationCode: session.location.code,
          locationName: session.location.name,
          recordedAt: now.toISOString(),
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
