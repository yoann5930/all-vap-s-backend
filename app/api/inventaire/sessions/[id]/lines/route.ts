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
import {
  OHM_VALUE_CONFLICT,
  evaluateResistanceAssociation,
  normalizeResistanceOhmValue,
  parseResistanceIdentityFromLine,
} from "@/lib/catalog/resistance-identification";
import {
  isResistanceProduct,
  parseUnitsPerPackFromName,
  resolveResistanceBoxPriceCents,
} from "@/lib/inventory/resistance-box-pricing";
import { classifyOnInventoryScan } from "@/lib/catalog/classification-engine";
import {
  INVENTORY_PLACEMENTS,
  normalizeInventoryPlacement,
  validateInventoryPlacementQuantity,
} from "@/lib/inventory/placement";
import { resolveProductByScannedBarcode } from "@/lib/inventory/resolve-barcode";
import {
  computeTotalUnits,
  isPackagedHardwareCategory,
  normalizeUnitsPerBox,
} from "@/lib/inventory/packaging";

type Ctx = { params: Promise<{ id: string }> };

async function ensurePlacementColumn() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "placement" TEXT NOT NULL DEFAULT 'STOCK'`
  );
}

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
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                range: true,
                barcode: true,
                priceCents: true,
                imageUrl: true,
              },
            },
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
        /** STOCK (défaut, illimité) | VITRINE (max 1) */
        placement: z.enum(INVENTORY_PLACEMENTS).optional(),
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
        taxonomyGroup: z.string().max(40).optional(),
        taxonomySubtype: z.string().max(40).optional(),
        categorySnapshot: z.string().max(120).optional(),
        formatSnapshot: z.string().max(40).optional(),
        resistanceValueOhm: z.number().positive().max(5).optional(),
        coilTechnology: z.string().max(40).optional(),
        unitsPerPack: z.number().int().positive().max(50).optional(),
        /** Conditionnement 1–5 (résistances / réservoirs) */
        unitsPerBox: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
        ]).optional(),
        fullBoxes: z.number().int().min(0).optional(),
        looseUnits: z.number().int().min(0).max(20).optional(),
        powerRangeMinW: z.number().int().positive().max(500).optional(),
        powerRangeMaxW: z.number().int().positive().max(500).optional(),
      })
      .parse(await request.json());

    await ensurePlacementColumn();
    const placement = normalizeInventoryPlacement(body.placement);

    // Conditionnement : quantité stock = unités réelles
    let unitsPerBoxSnapshot: number | null =
      normalizeUnitsPerBox(body.unitsPerBox) ??
      normalizeUnitsPerBox(body.unitsPerPack) ??
      null;
    let fullBoxesSnapshot: number | null =
      body.fullBoxes != null ? Math.max(0, Math.floor(body.fullBoxes)) : null;
    let looseUnitsSnapshot: number | null =
      body.looseUnits != null ? Math.max(0, Math.floor(body.looseUnits)) : null;
    let quantityCounted = body.quantityCounted;

    if (fullBoxesSnapshot != null || looseUnitsSnapshot != null) {
      if (unitsPerBoxSnapshot == null) {
        return jsonResponse(
          {
            error: "Conditionnement : quantité par boîte obligatoire (1 à 5)",
            code: "UNITS_PER_BOX_REQUIRED",
          },
          400
        );
      }
      fullBoxesSnapshot = fullBoxesSnapshot ?? 0;
      looseUnitsSnapshot = looseUnitsSnapshot ?? 0;
      if (looseUnitsSnapshot >= unitsPerBoxSnapshot) {
        return jsonResponse(
          {
            error: `Unités restantes doit être < ${unitsPerBoxSnapshot} (sinon comptez une boîte de plus)`,
            code: "LOOSE_UNITS_INVALID",
          },
          400
        );
      }
      quantityCounted = computeTotalUnits({
        fullBoxes: fullBoxesSnapshot,
        unitsPerBox: unitsPerBoxSnapshot,
        looseUnits: looseUnitsSnapshot,
      });
    }

    const placementCheck = validateInventoryPlacementQuantity({
      placement,
      quantityCounted,
    });
    if (!placementCheck.ok) {
      return jsonResponse(
        { error: placementCheck.error, code: placementCheck.code },
        400
      );
    }

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

    // EAN scanné : ProductBarcode (alias) → Product.barcode → variante → CatalogEanMap
    // Conserve l’EAN scanné dans `barcode` (traçabilité packaging).
    if (!productId && barcode) {
      const resolved = await resolveProductByScannedBarcode(barcode);
      if (resolved) {
        productId = resolved.productId;
      } else {
        const exact = await prisma.product.findFirst({
          where: {
            OR: [{ barcode }, { sku: barcode }, { sumupSku: barcode }],
          },
          select: { id: true },
        });
        if (exact) productId = exact.id;
      }
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
      // select explicite : évite un 500 si le schéma Prisma dérive (colonnes absentes en base)
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          brand: true,
          range: true,
          category: true,
          productFamily: true,
          unitsPerBox: true,
          imageUrl: true,
          barcode: true,
          priceCents: true,
          promoPriceCents: true,
          source: true,
          variants: {
            where: { active: true },
            take: 1,
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              size: true,
              capacityMl: true,
              nicotineLabel: true,
              nicotineMg: true,
            },
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

        const packaged = isPackagedHardwareCategory({
          name: product.name,
          category: product.category,
          productFamily: (product as { productFamily?: string | null }).productFamily,
        });
        if (packaged) {
          if (unitsPerBoxSnapshot == null && product.unitsPerBox != null) {
            unitsPerBoxSnapshot = normalizeUnitsPerBox(product.unitsPerBox);
          }
          // Persister le conditionnement saisi sur la fiche produit
          if (
            unitsPerBoxSnapshot != null &&
            product.unitsPerBox !== unitsPerBoxSnapshot
          ) {
            await prisma.product.update({
              where: { id: product.id },
              data: { unitsPerBox: unitsPerBoxSnapshot },
            });
          }
        } else {
          // Produit standard : ignorer conditionnement éventuel
          if (fullBoxesSnapshot != null || looseUnitsSnapshot != null) {
            // garder quantityCounted déjà fourni / recalculé seulement si packaging pertinent
          }
          if (!packaged && (body.fullBoxes != null || body.looseUnits != null)) {
            // Si l’UI a envoyé boîtes par erreur, garder body.quantityCounted original
            quantityCounted = body.quantityCounted;
            unitsPerBoxSnapshot = null;
            fullBoxesSnapshot = null;
            looseUnitsSnapshot = null;
          }
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
    // Résistances : ohms strictement identiques pour fusion / multi-EAN
    const unitsPerPackResolved =
      unitsPerBoxSnapshot ??
      body.unitsPerPack ??
      parseUnitsPerPackFromName(productNameSnapshot) ??
      null;
    const resistanceIdentity =
      body.resistanceValueOhm != null ||
      body.taxonomyGroup === "RESISTANCES" ||
      isResistanceProduct({
        name: productNameSnapshot,
        category: categorySnapshot,
        taxonomyGroup: body.taxonomyGroup,
      })
        ? {
            manufacturer: brandSnapshot,
            coilFamily: rangeSnapshot,
            technicalReference: null,
            resistanceValueOhm:
              body.resistanceValueOhm != null
                ? normalizeResistanceOhmValue(body.resistanceValueOhm)?.value ??
                  body.resistanceValueOhm
                : null,
            resistanceValueDisplay:
              body.resistanceValueOhm != null
                ? normalizeResistanceOhmValue(body.resistanceValueOhm)?.display ??
                  `${body.resistanceValueOhm} Ω`
                : null,
            coilTechnology: (body.coilTechnology as
              | "standard"
              | "mesh"
              | "dual_mesh"
              | "triple_mesh"
              | "ceramic"
              | "other_confirmed"
              | "unknown"
              | null) || null,
            unitsPerPack: unitsPerPackResolved,
            powerRangeMinW: body.powerRangeMinW ?? null,
            powerRangeMaxW: body.powerRangeMaxW ?? null,
          }
        : null;

    // Si productId catalogue déjà lié à une ligne session avec ohms différents → conflit
    if (productId && resistanceIdentity?.resistanceValueOhm != null) {
      const sessionLines = await prisma.inventoryLine.findMany({
        where: { sessionId: id, productId },
        take: 10,
      });
      for (const existingLine of sessionLines) {
        const existingId = parseResistanceIdentityFromLine({
          notes: existingLine.notes,
          formatSnapshot: existingLine.formatSnapshot,
          brandSnapshot: existingLine.brandSnapshot,
          rangeSnapshot: existingLine.rangeSnapshot,
          productNameSnapshot: existingLine.productNameSnapshot,
        });
        if (existingId.resistanceValueOhm == null) continue;
        const decision = evaluateResistanceAssociation(resistanceIdentity, existingId);
        if (!decision.allowed && decision.code === OHM_VALUE_CONFLICT) {
          return jsonResponse(
            {
              error: decision.message,
              code: OHM_VALUE_CONFLICT,
              compared: decision.compared,
            },
            409
          );
        }
      }
    }

    const dup = await findInventoryDuplicate({
      barcode,
      productId,
      locationId: session.locationId,
      locationCode: session.location.code,
      currentSessionId: id,
      resistanceIdentity,
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

    const unitsPerPackForPrice =
      unitsPerPackResolved ??
      body.unitsPerPack ??
      parseUnitsPerPackFromName(productNameSnapshot) ??
      null;
    const isResistanceLine =
      body.taxonomyGroup === "RESISTANCES" ||
      isResistanceProduct({
        name: productNameSnapshot,
        category: categorySnapshot || undefined,
        taxonomyGroup: body.taxonomyGroup,
      });

    if (isResistanceLine) {
      if (unitsPerPackForPrice == null || unitsPerPackForPrice < 1) {
        return jsonResponse(
          {
            error:
              "Résistance : nombre d’unités par boîte obligatoire (validé via le nom / fiche officielle)",
            code: "UNITS_PER_PACK_REQUIRED",
          },
          400
        );
      }
      // Prix enregistré = prix boîte. Si catalogue = unitaire, convertir.
      if (catalogPrice && catalogPrice.cents > 0) {
        const expectedBox = resolveResistanceBoxPriceCents({
          catalogPriceCents: catalogPrice.cents,
          unitsPerPack: unitsPerPackForPrice,
        });
        if (expectedBox != null) {
          if (unitPriceCents == null || unitPriceCents === catalogPrice.cents) {
            unitPriceCents = expectedBox;
            if (!priceSource) priceSource = catalogPrice.source;
          }
        }
      }
    }

    if (body.priceSource && !priceSource) {
      priceSource = body.priceSource;
    } else if (unitPriceCents != null && !priceSource) {
      priceSource = "SAISIE_MANUELLE";
    }

    const expectedBoxPrice =
      isResistanceLine &&
      unitsPerPackForPrice != null &&
      catalogPrice &&
      catalogPrice.cents > 0
        ? resolveResistanceBoxPriceCents({
            catalogPriceCents: catalogPrice.cents,
            unitsPerPack: unitsPerPackForPrice,
          })
        : null;
    const matchesResistanceBoxPrice =
      expectedBoxPrice != null &&
      unitPriceCents != null &&
      Math.abs(unitPriceCents - expectedBoxPrice) <= 1;

    // Employé : ne peut pas écraser un prix catalogue existant
    // (sauf prix boîte résistance cohérent avec la règle métier)
    if (
      user.role !== "ADMIN" &&
      catalogPrice &&
      catalogPrice.cents > 0 &&
      unitPriceCents != null &&
      unitPriceCents !== catalogPrice.cents &&
      !body.allowCatalogPriceOverride &&
      !matchesResistanceBoxPrice
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

    if (matchesResistanceBoxPrice && expectedBoxPrice != null) {
      unitPriceCents = expectedBoxPrice;
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

    const totalValueCents =
      isResistanceLine &&
      fullBoxesSnapshot != null &&
      unitsPerBoxSnapshot != null &&
      unitPriceCents != null
        ? fullBoxesSnapshot * unitPriceCents +
          (looseUnitsSnapshot ?? 0) *
            Math.round(unitPriceCents / Math.max(1, unitsPerBoxSnapshot))
        : computeLineTotalCents(quantityCounted, unitPriceCents);
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

    // Taxonomie inventaire (snapshots) — ne crée pas de produit catalogue
    if (body.categorySnapshot?.trim()) {
      categorySnapshot = body.categorySnapshot.trim();
    } else if (body.taxonomySubtype || body.taxonomyGroup) {
      categorySnapshot = [body.taxonomyGroup, body.taxonomySubtype].filter(Boolean).join("/");
    }
    if (body.formatSnapshot?.trim()) {
      formatSnapshot = body.formatSnapshot.trim();
    } else if (body.resistanceValueOhm != null) {
      formatSnapshot = `${body.resistanceValueOhm.toFixed(2)} Ω`;
    }

    if (
      body.taxonomyGroup === "RESISTANCES" &&
      (categorySnapshot === "accessoires" || body.taxonomySubtype === "ACC_OTHER")
    ) {
      return jsonResponse(
        {
          error: "Une résistance ne doit pas être classée en Accessoires",
          code: "RESISTANCE_NOT_ACCESSORY",
        },
        400
      );
    }
    if (
      (body.taxonomyGroup === "RESISTANCES" ||
        body.taxonomySubtype === "CART_INTEGRATED" ||
        body.taxonomySubtype === "POD_INTEGRATED") &&
      body.resistanceValueOhm == null
    ) {
      return jsonResponse(
        {
          error: "Valeur en ohms obligatoire (OHM_VALUE_REQUIRED)",
          code: "OHM_VALUE_REQUIRED",
        },
        400
      );
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
        quantityCounted,
        unitsPerBoxSnapshot,
        fullBoxesSnapshot,
        looseUnitsSnapshot,
        placement,
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
            `emplacement=${placement}`,
            body.taxonomyGroup ? `taxonomy=${body.taxonomyGroup}/${body.taxonomySubtype || ""}` : null,
            body.resistanceValueOhm != null
              ? `ohm=${body.resistanceValueOhm.toFixed(3)}`
              : null,
            body.coilTechnology ? `coilTech=${body.coilTechnology}` : null,
            (body.unitsPerPack ?? unitsPerPackResolved ?? unitsPerBoxSnapshot) != null
              ? `unitsPerPack=${body.unitsPerPack ?? unitsPerPackResolved ?? unitsPerBoxSnapshot}`
              : null,
            unitsPerBoxSnapshot != null ? `unitsPerBox=${unitsPerBoxSnapshot}` : null,
            fullBoxesSnapshot != null ? `fullBoxes=${fullBoxesSnapshot}` : null,
            looseUnitsSnapshot != null ? `looseUnits=${looseUnitsSnapshot}` : null,
            body.powerRangeMinW != null && body.powerRangeMaxW != null
              ? `watts=${body.powerRangeMinW}-${body.powerRangeMaxW}`
              : null,
            body.clientLineId ? `clientLineId=${body.clientLineId}` : null,
            `at=${now.toISOString()}`,
          ]
            .filter(Boolean)
            .join("; "),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            range: true,
            barcode: true,
            priceCents: true,
            imageUrl: true,
          },
        },
        photos: true,
      },
    });

    const oldQty = expectedQuantitySnapshot;

    // Moteur unique : tri fabricant/gamme au bip (jamais les stocks)
    let classification = null as Awaited<
      ReturnType<typeof classifyOnInventoryScan>
    >;
    if (productId) {
      classification = await classifyOnInventoryScan({
        productId,
        barcode,
      });
      // Rafraîchir snapshots catalogue si reclassement CONFIRME
      if (classification?.applied) {
        const refreshed = await prisma.product.findUnique({
          where: { id: productId },
          select: {
            brand: true,
            range: true,
            manufacturer: { select: { name: true } },
            rangeRef: { select: { name: true } },
          },
        });
        if (refreshed) {
          await prisma.inventoryLine.update({
            where: { id: line.id },
            data: {
              brandSnapshot:
                refreshed.manufacturer?.name || refreshed.brand || brandSnapshot,
              rangeSnapshot:
                refreshed.rangeRef?.name || refreshed.range || rangeSnapshot,
            },
          });
        }
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
      newQuantity: quantityCounted,
      ip,
      deviceInfo: request.headers.get("user-agent"),
      metadata: {
        barcode,
        lineId: line.id,
        unitPriceCents,
        priceSource,
        totalValueCents,
        unitsPerBoxSnapshot,
        fullBoxesSnapshot,
        looseUnitsSnapshot,
      },
    });

    await writeInventoryAudit({
      user,
      inventoryId: id,
      inventoryItemId: line.id,
      action: "LINE_CREATED",
      fieldName: "quantityCounted",
      oldValue: null,
      newValue: quantityCounted,
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
          classification: classification
            ? {
                confidence: classification.confidence,
                applied: classification.applied,
                skipped: classification.skipped,
                reason: classification.reason,
                manufacturerSlug: classification.manufacturerSlug,
                rangeSlug: classification.rangeSlug,
              }
            : null,
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
