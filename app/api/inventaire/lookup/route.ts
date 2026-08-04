import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { matchCatalogProduct } from "@/lib/catalog/matching";
import { normalizeProductName } from "@/lib/catalog/normalize";
import { getDualStockForProduct } from "@/lib/catalog/stock";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { resolveCatalogUnitPriceCents } from "@/lib/inventory/session-summary";
import { formatEuroFromCents } from "@/lib/inventory/pricing";

/** Lookup barcode inventaire — EMPLOYEE/ADMIN authentifié. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireInventoryAuth();
    void clientIp(request);
    const limit = checkRateLimit(`inventaire:lookup:${user.userId}`, 180, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de scans", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
    if (!barcode) {
      return jsonResponse({ error: "Paramètre barcode requis" }, 400);
    }

    const catalog = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        normalizedName: true,
        sku: true,
        barcode: true,
        sumupProductId: true,
        brand: true,
        range: true,
        category: true,
        imageUrl: true,
        priceCents: true,
        promoPriceCents: true,
        source: true,
        variants: {
          where: { active: true },
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            nicotineMg: true,
            nicotineLabel: true,
            capacityMl: true,
            size: true,
            name: true,
          },
        },
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

    if (!match.productId) {
      return jsonResponse({
        found: false,
        barcode,
        decision: match.decision,
        confidence: match.confidence,
        price: null,
        priceMissing: true,
      });
    }

    const product = catalog.find((p) => p.id === match.productId);
    const dual = await getDualStockForProduct(match.productId);
    const variant = product?.variants?.[0];
    const price =
      product && product.priceCents != null
        ? resolveCatalogUnitPriceCents(product)
        : null;

    const nicotine =
      variant?.nicotineLabel ||
      (variant?.nicotineMg != null ? `${variant.nicotineMg} mg` : null);
    const format =
      variant?.capacityMl != null
        ? `${variant.capacityMl} ml`
        : variant?.size || variant?.name || null;

    return jsonResponse({
      found: true,
      barcode,
      decision: match.decision,
      method: match.method,
      confidence: match.confidence,
      priceMissing: !price || price.cents <= 0,
      price: price
        ? {
            unitPriceCents: price.cents,
            unitPriceLabel: formatEuroFromCents(price.cents),
            source: price.source,
            editable: false,
          }
        : null,
      product: {
        id: product?.id,
        name: product?.name,
        sku: product?.sku,
        barcode: product?.barcode,
        brand: product?.brand,
        range: product?.range,
        category: product?.category,
        format,
        nicotine,
        imageUrl: product?.imageUrl,
        stockHautmont: dual.hautmont.quantity,
        stockLeQuesnoy: dual.leQuesnoy.quantity,
        stockGlobal: dual.global.quantity,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
