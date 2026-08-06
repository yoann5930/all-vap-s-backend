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
import {
  applyUnitPriceToRange,
  findRangeUnitPriceCents,
} from "@/lib/inventory/range-pricing";
import {
  duplicateMessage,
  findInventoryDuplicate,
} from "@/lib/inventory/duplicates";

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
        productName: z.string().min(1).max(200).optional(),
        brand: z.string().max(120).optional(),
        range: z.string().max(120).optional(),
        quantityCounted: z.number().int().min(0),
        photoPath: z.string().optional(),
        photoConfirmed: z.boolean().optional(),
        notes: z.string().max(500).optional(),
        unitPriceCents: z.number().int().optional(),
        unitPrice: z.union([z.string(), z.number()]).optional(),
        priceSource: z.enum(PRICE_SOURCES).optional(),
        applyToRange: z.boolean().optional(),
        confirmZeroPrice: z.boolean().optional(),
        confirmHighAmount: z.boolean().optional(),
        allowCatalogPriceOverride: z.boolean().optional(),
        /** true = autoriser malgré doublon (admin seulement) */
        allowDuplicate: z.boolean().optional(),
        /** Id client hors-ligne — idempotence soft */
        clientLineId: z.string().max(80).optional(),
      })
      .parse(await request.json());

    let barcode = (body.barcode || "").trim() || null;
    let productId = body.productId || null;
    let variantId: string | null = null;
    let productNameSnapshot: string | null = body.productName?.trim() || null;
    let brandSnapshot: string | null = body.brand?.trim() || null;
    let rangeSnapshot: string | null = body.range?.trim() || null;
    let categorySnapshot: string | null = null;
    let formatSnapshot: string | null = null;
    let nicotineSnapshot: string | null = null;
    let catalogImageUrl: string | null = null;
    let catalogPrice: { cents: number; source: PriceSource } | null = null;

    // EAN scanné : correspondance EXACTE uniquement (jamais approximative)
    if (!productId && barcode) {
      const exact = await prisma.product.findFirst({
        where: {
          OR: [{ barcode }, { sku: barcode }, { sumupSku: barcode }],
        },
        select: { id: true },
      });
      if (exact) productId = exact.id;
    }

    // Match par nom si pas d'EAN / EAN inconnu
    if (!productId && productNameSnapshot) {
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
          name: productNameSnapshot,
          normalizedName: normalizeProductName(productNameSnapshot),
          barcode: barcode || undefined,
        },
        catalog
      );
      if (match.productId && (match.decision === "AUTO" || match.confidence >= 0.95)) {
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
        if (!barcode && product.barcode) {
          barcode = product.barcode;
        }
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
      }
    }

    // Code-barres : obligatoire sauf si produit catalogue identifié (EAN mémoire éventuel)
    if (!barcode || barcode.length < 6) {
      if (productId) {
        barcode = barcode && barcode.length >= 4 ? barcode : `MEM-${productId.slice(-10)}`;
      } else {
        return jsonResponse(
          {
            error:
              "Code-barres manquant — scannez un EAN ou choisissez un produit en mémoire (nom)",
            code: "BARCODE_REQUIRED",
          },
          400
        );
      }
    }

    // Anti-doublon : même inventaire / même jour / 30 jours
    const dup = await findInventoryDuplicate({
      barcode,
      productId,
      locationId: session.locationId,
      locationCode: session.location.code,
      currentSessionId: id,
    });
    if (dup && !(body.allowDuplicate && user.role === "ADMIN")) {
      return jsonResponse(
        {
          error: duplicateMessage(dup),
          code: "DUPLICATE",
          duplicate: {
            ...dup,
            scannedAt: dup.scannedAt.toISOString(),
          },
        },
        409
      );
    }

    if (!productNameSnapshot) {
      return jsonResponse(
        {
          error:
            "Nom du produit obligatoire — renseignez le nom (et la gamme) avant enregistrement",
          code: "NAME_REQUIRED",
        },
        400
      );
    }

    // Gamme optionnelle à l’enregistrement auto : fallback catégorie / Non classé
    if (!rangeSnapshot) {
      rangeSnapshot = categorySnapshot || "Non classé";
    }

    // Résolution prix
    let unitPriceCents: number | null = null;
    let priceSource: PriceSource | null = null;

    // Prix catalogue connu : priorité sauf correction admin explicite
    if (catalogPrice && catalogPrice.cents > 0 && user.role !== "ADMIN") {
      if (body.priceSource === "CATALOGUE" || body.priceSource === "SUMUP") {
        unitPriceCents = catalogPrice.cents;
        priceSource = catalogPrice.source;
      }
    }

    // Prix gamme si catalogue absent
    if (unitPriceCents == null && rangeSnapshot) {
      const rangePrice = await findRangeUnitPriceCents({
        range: rangeSnapshot,
        brand: brandSnapshot,
      });
      if (rangePrice) {
        unitPriceCents = rangePrice.cents;
        priceSource = "GAMME";
      }
    }

    if (unitPriceCents == null) {
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
    }

    if (body.priceSource && !priceSource) {
      priceSource = body.priceSource;
    } else if (unitPriceCents != null && !priceSource) {
      priceSource = "SAISIE_MANUELLE";
    }

    // Employé : ne peut pas écraser un prix catalogue existant
    if (
      user.role !== "ADMIN" &&
      catalogPrice &&
      catalogPrice.cents > 0 &&
      unitPriceCents != null &&
      unitPriceCents !== catalogPrice.cents &&
      !body.allowCatalogPriceOverride
    ) {
      // Tolérance : si la saisie est le prix catalogue arrondi, forcer catalogue
      if (Math.abs(unitPriceCents - catalogPrice.cents) <= 1) {
        unitPriceCents = catalogPrice.cents;
        priceSource = catalogPrice.source;
      } else {
        return jsonResponse(
          {
            error: "Prix catalogue non modifiable — contactez un administrateur",
            catalogPriceCents: catalogPrice.cents,
          },
          403
        );
      }
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

    // Un prix par gamme → appliqué à tous les produits de la gamme
    let rangePriceApplied = 0;
    if (body.applyToRange && rangeSnapshot && unitPriceCents > 0) {
      const applied = await applyUnitPriceToRange({
        range: rangeSnapshot,
        brand: brandSnapshot,
        unitPriceCents,
      });
      rangePriceApplied = applied.updated;
      if (!priceSource || priceSource === "SAISIE_MANUELLE") {
        priceSource = "GAMME";
      }
    }

    const totalValueCents = computeLineTotalCents(body.quantityCounted, unitPriceCents);
    const now = new Date();

    let expectedQuantitySnapshot: number | null = null;
    if (productId) {
      try {
        const dual = await getDualStockForProduct(productId);
        expectedQuantitySnapshot =
          session.location.code === "LE_QUESNOY"
            ? dual.leQuesnoy.quantity
            : dual.hautmont.quantity;
      } catch {
        expectedQuantitySnapshot = null;
      }
    }

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
        expectedQuantitySnapshot,
        unitPriceCents,
        totalValueCents,
        priceSource,
        photoPath: body.photoPath,
        scannedByUserId: user.userId,
        scannedAt: now,
        notes:
          body.notes ||
          [
            `employé=${session.employeeName}`,
            `boutique=${session.location.code}`,
            `gamme=${rangeSnapshot}`,
            body.clientLineId ? `clientLineId=${body.clientLineId}` : null,
            `at=${now.toISOString()}`,
          ]
            .filter(Boolean)
            .join("; "),
      },
      include: { product: true, photos: true },
    });

    const oldQty = expectedQuantitySnapshot;

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
          rangePriceApplied,
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
