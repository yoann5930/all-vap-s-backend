import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { matchCatalogProduct } from "@/lib/catalog/matching";
import { normalizeProductName } from "@/lib/catalog/normalize";
import { getDualStockForProduct } from "@/lib/catalog/stock";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { resolveCatalogUnitPriceCents } from "@/lib/inventory/session-summary";
import { formatEuroFromCents } from "@/lib/inventory/pricing";
import { findRangeUnitPriceCents } from "@/lib/inventory/range-pricing";
import {
  duplicateMessage,
  findInventoryDuplicate,
} from "@/lib/inventory/duplicates";
import { resolveProductByScannedBarcode } from "@/lib/inventory/resolve-barcode";
import { normalizeEan } from "@/lib/catalog/backfill-product-barcodes";
import {
  parseNicotineMgFromText,
  parseVolumeMlFromText,
  suggestProductForUnknownBarcode,
} from "@/lib/inventory/barcode-alias-suggest";
import {
  formatPackagedStockLabel,
  isPackagedHardwareCategory,
  splitUnitsIntoBoxes,
} from "@/lib/inventory/packaging";
import { attachBarcodeToProduct } from "@/lib/inventory/product-barcodes";
import { canAutoLinkByName } from "@/lib/inventory/product-identity-guards";
import { classifyInventoryBrandRange } from "@/lib/catalog/ranges-not-manufacturers";

type CatalogRow = {
  id: string;
  name: string;
  normalizedName: string | null;
  sku: string | null;
  barcode: string | null;
  sumupProductId: string | null;
  brand: string | null;
  range: string | null;
  category: string | null;
  productFamily?: string | null;
  unitsPerBox?: number | null;
  volumeMl?: number | null;
  imageUrl: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  source: string | null;
  variants: Array<{
    nicotineMg: number | null;
    nicotineLabel: string | null;
    capacityMl: number | null;
    size: string | null;
    name: string;
  }>;
};

async function maybeDuplicateInfo(params: {
  sessionId: string;
  barcode?: string | null;
  productId?: string | null;
  placement?: string | null;
}) {
  if (!params.sessionId) return null;
  const session = await prisma.inventorySession.findUnique({
    where: { id: params.sessionId },
    include: { location: true },
  });
  if (!session) return null;
  const dup = await findInventoryDuplicate({
    barcode: params.barcode,
    productId: params.productId,
    locationId: session.locationId,
    locationCode: session.location.code,
    currentSessionId: params.sessionId,
    placement: params.placement,
  });
  if (!dup) return null;
  return {
    ...dup,
    scannedAt: dup.scannedAt.toISOString(),
    message: duplicateMessage(dup),
  };
}

async function buildProductPayload(
  product: CatalogRow,
  userRole: string,
  matchedBy: string
) {
  const dual = await getDualStockForProduct(product.id);
  const variant = product.variants?.[0];
  let price =
    product.priceCents != null ? resolveCatalogUnitPriceCents(product) : null;

  let priceFromRange = false;
  if ((!price || price.cents <= 0) && product.range) {
    const rangePrice = await findRangeUnitPriceCents({
      range: product.range,
      brand: product.brand,
    });
    if (rangePrice) {
      price = { cents: rangePrice.cents, source: "GAMME" };
      priceFromRange = true;
    }
  }

  const nicotine =
    variant?.nicotineLabel ||
    (variant?.nicotineMg != null ? `${variant.nicotineMg} mg` : null);
  const format =
    variant?.capacityMl != null
      ? `${variant.capacityMl} ml`
      : variant?.size || variant?.name || null;

  const classified = classifyInventoryBrandRange({
    brand: product.brand,
    range: product.range,
  });

  return {
    found: true as const,
    matchedBy,
    barcode: product.barcode,
    priceMissing: !price || price.cents <= 0,
    priceFromRange,
    price: price
      ? {
          unitPriceCents: price.cents,
          unitPriceLabel: formatEuroFromCents(price.cents),
          source: price.source,
          editable: price.source === "GAMME" || userRole === "ADMIN",
        }
      : null,
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      brand: classified.brand,
      range: classified.range,
      category: product.category,
      volumeMl: product.volumeMl ?? null,
      unitsPerBox: product.unitsPerBox ?? null,
      format,
      nicotine,
      imageUrl: product.imageUrl,
      stockHautmont: dual.hautmont.quantity,
      stockLeQuesnoy: dual.leQuesnoy.quantity,
      stockGlobal: dual.global.quantity,
      stockLabel: formatPackagedStockLabel({
        totalUnits: dual.global.quantity,
        unitsPerBox: product.unitsPerBox,
      }),
      packaging: isPackagedHardwareCategory({
        name: product.name,
        category: product.category,
        productFamily: product.productFamily,
      })
        ? (() => {
            const per = product.unitsPerBox ?? null;
            const split =
              per != null
                ? splitUnitsIntoBoxes({
                    totalUnits: dual.global.quantity,
                    unitsPerBox: per,
                  })
                : null;
            return {
              unitsPerBox: per,
              fullBoxes: split?.fullBoxes ?? null,
              looseUnits: split?.looseUnits ?? null,
              totalUnits: dual.global.quantity,
            };
          })()
        : null,
    },
  };
}

function scoreNameHit(query: string, product: CatalogRow): number {
  const q = normalizeProductName(query);
  if (!q) return 0;
  const name = normalizeProductName(product.name || "");
  const brand = normalizeProductName(product.brand || "");
  const range = normalizeProductName(product.range || "");
  const hay = `${name} ${brand} ${range}`.trim();

  if (name === q) return 1;
  if (hay === q) return 0.98;
  if (name.startsWith(q) || q.startsWith(name)) return 0.92;
  if (name.includes(q) || q.includes(name)) return 0.85;
  if (brand && (brand.includes(q) || q.includes(brand))) return 0.7;
  if (range && (range.includes(q) || q.includes(range))) return 0.65;
  if (hay.includes(q)) return 0.6;
  return 0;
}

/**
 * Lookup inventaire — mémoire catalogue :
 * - ?barcode=... → match code-barres
 * - ?name=... ou ?q=... → match / suggestions par nom (avec ou sans EAN)
 * - ?suggest=1 → liste de suggestions
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireInventoryAuth();
    void clientIp(request);
    const limit = checkRateLimit(`inventaire:lookup:${user.userId}`, 240, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de recherches", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const url = new URL(request.url);
    const barcode = url.searchParams.get("barcode")?.trim() || "";
    const nameQuery =
      url.searchParams.get("name")?.trim() ||
      url.searchParams.get("q")?.trim() ||
      "";
    const suggestOnly = url.searchParams.get("suggest") === "1";
    const sessionId = url.searchParams.get("sessionId")?.trim() || "";
    const locationCode = url.searchParams.get("store")?.trim() || "";
    const placement = url.searchParams.get("placement")?.trim() || "";

    if (!barcode && !nameQuery) {
      return jsonResponse(
        { error: "Indiquez un code-barres (?barcode=) ou un nom (?name= / ?q=)" },
        400
      );
    }

    const catalog = (await prisma.product.findMany({
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
        productFamily: true,
        unitsPerBox: true,
        volumeMl: true,
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
      take: 5000,
    })) as CatalogRow[];

    // Mémoire session : produits déjà scannés dans cet inventaire
    const sessionMemory: Array<{
      productId: string | null;
      barcode: string | null;
      name: string | null;
      brand: string | null;
      range: string | null;
      unitPriceCents: number | null;
    }> = [];

    if (sessionId) {
      const lines = await prisma.inventoryLine.findMany({
        where: { sessionId },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          productId: true,
          barcode: true,
          productNameSnapshot: true,
          brandSnapshot: true,
          rangeSnapshot: true,
          unitPriceCents: true,
        },
      });
      for (const l of lines) {
        sessionMemory.push({
          productId: l.productId,
          barcode: l.barcode,
          name: l.productNameSnapshot,
          brand: l.brandSnapshot,
          range: l.rangeSnapshot,
          unitPriceCents: l.unitPriceCents,
        });
      }
    }

    // 1) Recherche code-barres
    if (barcode) {
      const attachDup = async (
        base: Record<string, unknown>,
        productId?: string | null
      ) => {
        const duplicate = sessionId
          ? await maybeDuplicateInfo({
              sessionId,
              barcode,
              productId: productId || null,
              placement,
            })
          : null;
        return jsonResponse({ ...base, duplicate });
      };

      const fromSession = sessionMemory.find((m) => {
        const mb = (m.barcode || "").trim();
        if (!mb) return false;
        if (mb === barcode) return true;
        const a = normalizeEan(mb);
        const b = normalizeEan(barcode);
        return Boolean(a && b && a === b);
      });
      if (fromSession?.productId) {
        const product = catalog.find((p) => p.id === fromSession.productId);
        if (product) {
          const payload = await buildProductPayload(
            product,
            user.role,
            "session_memory_barcode"
          );
          return attachDup(
            {
              ...payload,
              decision: "AUTO",
              method: "session_memory",
              confidence: 1,
              fromMemory: true,
            },
            product.id
          );
        }
      }

      // Résolution directe DB : Product.barcode / variante / sku / sumupSku
      const resolved = await resolveProductByScannedBarcode(barcode);
      if (resolved) {
        let product = catalog.find((p) => p.id === resolved.productId);
        if (!product) {
          const row = await prisma.product.findUnique({
            where: { id: resolved.productId },
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
              productFamily: true,
              unitsPerBox: true,
              volumeMl: true,
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
          if (row) product = row as CatalogRow;
        }
        if (product) {
          const payload = await buildProductPayload(
            product,
            user.role,
            resolved.matchedBy
          );
          return attachDup(
            {
              ...payload,
              decision: "AUTO",
              method: resolved.matchedBy,
              confidence: 1,
              fromMemory: false,
            },
            product.id
          );
        }
      }

      const match = matchCatalogProduct(
        {
          name: barcode,
          normalizedName: normalizeProductName(barcode),
          barcode: normalizeEan(barcode) || barcode,
        },
        catalog.map((p) => ({
          ...p,
          barcode: normalizeEan(p.barcode) || p.barcode,
        }))
      );

      if (match.productId && (match.decision === "AUTO" || match.confidence >= 0.9)) {
        const product = catalog.find((p) => p.id === match.productId);
        if (product) {
          const payload = await buildProductPayload(
            product,
            user.role,
            "barcode"
          );
          return attachDup(
            {
              ...payload,
              decision: match.decision,
              method: match.method,
              confidence: match.confidence,
              fromMemory: true,
            },
            product.id
          );
        }
      }

      // Pas trouvé en catalogue : si mémoire session a le nom pour cet EAN
      if (fromSession?.name) {
        return attachDup(
          {
            found: true,
            matchedBy: "session_memory_line",
            fromMemory: true,
            decision: "AUTO",
            method: "session_memory",
            confidence: 1,
            barcode,
            priceMissing:
              fromSession.unitPriceCents == null || fromSession.unitPriceCents <= 0,
            price:
              fromSession.unitPriceCents != null && fromSession.unitPriceCents > 0
                ? {
                    unitPriceCents: fromSession.unitPriceCents,
                    unitPriceLabel: formatEuroFromCents(fromSession.unitPriceCents),
                    source: "SAISIE_MANUELLE",
                    editable: true,
                  }
                : null,
            product: {
              id: fromSession.productId,
              name: fromSession.name,
              sku: null,
              barcode,
              brand: fromSession.brand,
              range: fromSession.range,
              category: null,
              format: null,
              nicotine: null,
              imageUrl: null,
              stockHautmont: 0,
              stockLeQuesnoy: 0,
              stockGlobal: 0,
            },
          },
          fromSession.productId
        );
      }

      // EAN inconnu : si un nom est fourni, continuer vers la recherche + proposition d’alias
      if (!nameQuery) {
        return jsonResponse({
          found: false,
          barcode,
          decision: match.decision,
          confidence: match.confidence,
          price: null,
          priceMissing: true,
          requiresManualIdentity: true,
          suggestions: [],
          aliasSuggestion: null,
          duplicate: sessionId
            ? await maybeDuplicateInfo({ sessionId, barcode, placement })
            : null,
          message:
            "Code-barres inconnu en mémoire — saisissez le nom pour rechercher dans le catalogue",
        });
      }
    }

    // 2) Recherche par nom (avec ou sans code-barres en mémoire)
    const q = nameQuery;
    const scored = catalog
      .map((p) => ({ product: p, score: scoreNameHit(q, p) }))
      .filter((x) => x.score >= 0.6)
      .sort((a, b) => b.score - a.score);

    // Enrichir avec mémoire session (noms déjà saisis)
    const sessionHits = sessionMemory
      .filter((m) => m.name && normalizeProductName(m.name).includes(normalizeProductName(q)))
      .slice(0, 5);

    const suggestions = [
      ...scored.slice(0, 12).map(({ product, score }) => {
        const classified = classifyInventoryBrandRange({
          brand: product.brand,
          range: product.range,
        });
        return {
        id: product.id,
        name: product.name,
        brand: classified.brand,
        range: classified.range,
        barcode: product.barcode,
        imageUrl: product.imageUrl,
        unitPriceCents: product.priceCents > 0 ? product.priceCents : null,
        unitPriceLabel:
          product.priceCents > 0 ? formatEuroFromCents(product.priceCents) : null,
        score,
        source: "catalog" as const,
      };
      }),
      ...sessionHits.map((m) => {
        const classified = classifyInventoryBrandRange({
          brand: m.brand,
          range: m.range,
        });
        return {
        id: m.productId || `mem-${m.barcode || m.name}`,
        name: m.name || "",
        brand: classified.brand,
        range: classified.range,
        barcode: m.barcode,
        imageUrl: null as string | null,
        unitPriceCents: m.unitPriceCents,
        unitPriceLabel:
          m.unitPriceCents != null ? formatEuroFromCents(m.unitPriceCents) : null,
        score: 0.8,
        source: "session" as const,
      };
      }),
    ].slice(0, 15);

    if (suggestOnly) {
      const aliasSuggestion =
        barcode && q
          ? await suggestProductForUnknownBarcode({
              barcode,
              nameHint: q,
              brandHint: null,
              rangeHint: null,
              volumeMlHint: parseVolumeMlFromText(q),
              nicotineMgHint: parseNicotineMgFromText(q),
            })
          : null;
      return jsonResponse({
        found: suggestions.length > 0,
        query: q,
        barcode: barcode || null,
        suggestions,
        aliasSuggestion,
        fromMemory: true,
        message: aliasSuggestion
          ? `Ce code-barres semble correspondre à : ${aliasSuggestion.name}. Voulez-vous associer ce nouveau code-barres au produit existant ?`
          : undefined,
      });
    }

    // P1#1 : jamais d'AUTO si volume/nicotine conflictuels (ex. 50≠100 ml)
    const bestCompatible = scored.find(
      (x) =>
        x.score >= 0.85 &&
        canAutoLinkByName({
          sourceName: q,
          sourceVolumeMl: parseVolumeMlFromText(q),
          sourceNicotineMg: parseNicotineMgFromText(q),
          candidate: {
            name: x.product.name,
            volumeMl: x.product.volumeMl ?? null,
            nicotineMgs: (x.product.variants || []).map((v) => v.nicotineMg),
          },
        })
    );
    if (bestCompatible) {
      const payload = await buildProductPayload(
        bestCompatible.product,
        user.role,
        "name_memory"
      );
      const duplicate = sessionId
        ? await maybeDuplicateInfo({
            sessionId,
            barcode: bestCompatible.product.barcode,
            productId: bestCompatible.product.id,
            placement,
          })
        : null;
      return jsonResponse({
        ...payload,
        decision: bestCompatible.score >= 0.95 ? "AUTO" : "REVIEW",
        method: "normalized_name",
        confidence: bestCompatible.score,
        fromMemory: true,
        suggestions,
        duplicate,
      });
    }

    // Session memory exact-ish name
    const sessionBest = sessionHits[0];
    if (sessionBest?.name) {
      const duplicate = sessionId
        ? await maybeDuplicateInfo({
            sessionId,
            barcode: sessionBest.barcode,
            productId: sessionBest.productId,
            placement,
          })
        : null;
      return jsonResponse({
        found: true,
        matchedBy: "session_memory_name",
        fromMemory: true,
        decision: "AUTO",
        method: "session_memory",
        confidence: 0.9,
        barcode: sessionBest.barcode,
        priceMissing:
          sessionBest.unitPriceCents == null || sessionBest.unitPriceCents <= 0,
        price:
          sessionBest.unitPriceCents != null && sessionBest.unitPriceCents > 0
            ? {
                unitPriceCents: sessionBest.unitPriceCents,
                unitPriceLabel: formatEuroFromCents(sessionBest.unitPriceCents),
                source: "SAISIE_MANUELLE",
                editable: true,
              }
            : null,
        product: {
          id: sessionBest.productId,
          name: sessionBest.name,
          sku: null,
          barcode: sessionBest.barcode,
          brand: sessionBest.brand,
          range: sessionBest.range,
          category: null,
          format: null,
          nicotine: null,
          imageUrl: null,
          stockHautmont: 0,
          stockLeQuesnoy: 0,
          stockGlobal: 0,
        },
        suggestions,
        duplicate,
      });
    }

    const aliasSuggestion =
      barcode && q
        ? await suggestProductForUnknownBarcode({
            barcode,
            nameHint: q,
            brandHint: null,
            rangeHint: null,
            volumeMlHint: parseVolumeMlFromText(q),
            nicotineMgHint: parseNicotineMgFromText(q),
          })
        : null;

    return jsonResponse({
      found: false,
      query: q,
      barcode: barcode || null,
      priceMissing: true,
      requiresManualIdentity: true,
      suggestions,
      aliasSuggestion,
      fromMemory: true,
      message: aliasSuggestion
        ? `Ce code-barres semble correspondre à : ${aliasSuggestion.name}. Voulez-vous associer ce nouveau code-barres au produit existant ?`
        : suggestions.length > 0
          ? "Plusieurs produits en mémoire — choisissez une suggestion"
          : "Aucun produit trouvé en mémoire pour ce nom",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Associer un EAN scanné à un produit existant (après confirmation employé). */
export async function POST(request: NextRequest) {
  try {
    // Même contrat que GET : requireInventoryAuth() retourne InventoryAuthUser
    // (lance UNAUTHORIZED / FORBIDDEN — géré par handleApiError).
    const user = await requireInventoryAuth();
    const limit = checkRateLimit(
      `inventaire:lookup-post:${user.userId}:${clientIp(request)}`,
      60,
      60_000
    );
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de requêtes", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const body = z
      .object({
        action: z.literal("associate_barcode"),
        productId: z.string().min(1),
        barcode: z.string().min(6).max(64),
        label: z.string().max(120).optional().nullable(),
      })
      .parse(await request.json());

    const result = await attachBarcodeToProduct({
      productId: body.productId,
      barcode: body.barcode,
      role: "ALIAS",
      label: body.label ?? "nouveau packaging",
    });
    if (!result.ok) {
      return jsonResponse(result, 400);
    }

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
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
        productFamily: true,
        unitsPerBox: true,
        volumeMl: true,
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
    if (!product) return jsonResponse({ error: "Produit introuvable" }, 404);

    const payload = await buildProductPayload(
      product as CatalogRow,
      user.role,
      "barcode_alias_attached"
    );
    return jsonResponse({
      ok: true,
      associated: true,
      scannedBarcode: body.barcode,
      ...payload,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
