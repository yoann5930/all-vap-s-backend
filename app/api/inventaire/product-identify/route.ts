import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { formatEuroFromCents } from "@/lib/inventory/pricing";
import {
  extractLabelWithOpenAI,
  isPlausibleBarcode,
  searchExternalProducts,
} from "@/lib/inventory/external-product-search";

/**
 * POST /api/inventaire/product-identify
 * Endpoint isolé — identification produit inconnu (lecture seule).
 * Ne modifie ni stock, ni prix, ni Prisma schema.
 * Aucun prix Internet n’est renvoyé.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(
      `inventaire:identify:${user.userId}:${ip}`,
      30,
      15 * 60 * 1000
    );
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de recherches", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const body = z
      .object({
        barcode: z.string().max(64).optional(),
        query: z.string().max(200).optional(),
        /** data URL image temporaire (jamais stockée) — OCR Vision optionnel */
        imageDataUrl: z.string().max(1_000_000).optional(),
      })
      .parse(await request.json());

    const barcode = (body.barcode || "").trim() || null;
    let query = (body.query || "").trim() || null;
    let ocrText: string | null = null;
    let visionUsed = false;
    let visionHit: {
      name: string | null;
      brand: string | null;
      range: string | null;
      barcode: string | null;
      confidence: number;
    } | null = null;

    const diagnostics: Record<string, unknown> = {
      barcodeProvided: Boolean(barcode),
      queryProvided: Boolean(query),
      imageProvided: Boolean(body.imageDataUrl),
      localSearch: false,
      externalSearch: false,
      ocrTriggered: false,
      sourcesTried: [] as string[],
      resultCount: 0,
    };

    // OCR / vision optionnelle (OPENAI_API_KEY)
    if (body.imageDataUrl && (process.env.OPENAI_API_KEY || "").trim()) {
      diagnostics.ocrTriggered = true;
      visionUsed = true;
      const extracted = await extractLabelWithOpenAI(body.imageDataUrl);
      if (extracted) {
        visionHit = extracted;
        ocrText = extracted.ocrText;
        if (!barcode && extracted.barcode && extracted.barcode.length >= 8) {
          // EAN lu sur l’image
          (diagnostics as { barcodeFromVision?: string }).barcodeFromVision =
            extracted.barcode;
        }
        if (!query) {
          query = [extracted.brand, extracted.range, extracted.name, extracted.ocrText]
            .filter(Boolean)
            .join(" ")
            .slice(0, 200);
        }
      }
    }

    const effectiveBarcode =
      barcode ||
      (visionHit?.barcode && visionHit.barcode.length >= 8 ? visionHit.barcode : null);

    const safeBarcode =
      effectiveBarcode && isPlausibleBarcode(effectiveBarcode) ? effectiveBarcode : null;

    type Suggestion = {
      name: string;
      brand: string | null;
      range: string | null;
      barcode: string | null;
      sku: string | null;
      source: string;
      confidence: number;
      localProductId: string | null;
      unitPriceCents: number | null;
      unitPriceLabel: string | null;
      priceFromLocalOnly: true;
    };

    const suggestions: Suggestion[] = [];

    // Niveau 1 — local Prisma (lecture)
    diagnostics.localSearch = true;
    if (safeBarcode) {
      const local = await prisma.product.findFirst({
        where: {
          OR: [{ barcode: safeBarcode }, { sku: safeBarcode }],
        },
        select: {
          id: true,
          name: true,
          brand: true,
          range: true,
          category: true,
          barcode: true,
          sku: true,
          priceCents: true,
        },
      });
      if (local) {
        const priceOk = local.priceCents > 0;
        suggestions.push({
          name: local.name,
          brand: local.brand,
          range: local.range || local.category,
          barcode: local.barcode || safeBarcode,
          sku: local.sku,
          source: "local-catalog",
          confidence: 1,
          localProductId: local.id,
          unitPriceCents: priceOk ? local.priceCents : null,
          unitPriceLabel: priceOk ? formatEuroFromCents(local.priceCents) : null,
          priceFromLocalOnly: true,
        });
      }
    }

    // Niveau 2 / 4 — externe (EAN puis texte)
    const external = await searchExternalProducts({
      barcode: safeBarcode,
      query:
        query ||
        (visionHit
          ? [visionHit.brand, visionHit.range, visionHit.name].filter(Boolean).join(" ")
          : null),
      brandHint: visionHit?.brand || null,
    });
    diagnostics.externalSearch = external.externalEnabled;
    diagnostics.sourcesTried = external.sourcesTried;

    for (const hit of external.hits) {
      // Prix : uniquement si on retrouve le même EAN en local
      let localProductId: string | null = null;
      let unitPriceCents: number | null = null;
      let unitPriceLabel: string | null = null;
      if (hit.barcode) {
        const local = await prisma.product.findFirst({
          where: { barcode: hit.barcode },
          select: { id: true, priceCents: true },
        });
        if (local) {
          localProductId = local.id;
          if (local.priceCents > 0) {
            unitPriceCents = local.priceCents;
            unitPriceLabel = formatEuroFromCents(local.priceCents);
          }
        }
      }
      suggestions.push({
        name: hit.name,
        brand: hit.brand,
        range: hit.range,
        barcode: hit.barcode || safeBarcode,
        sku: hit.sku,
        source: hit.source,
        confidence: hit.confidence,
        localProductId,
        unitPriceCents,
        unitPriceLabel,
        priceFromLocalOnly: true,
      });
    }

    // Suggestion issue de la vision seule (si assez confiante et pas déjà couverte)
    if (visionHit?.name && visionHit.confidence >= 0.55) {
      const already = suggestions.some(
        (s) => s.name.toLowerCase() === visionHit!.name!.toLowerCase()
      );
      if (!already) {
        suggestions.push({
          name: visionHit.name,
          brand: visionHit.brand,
          range: visionHit.range,
          barcode: visionHit.barcode || safeBarcode,
          sku: null,
          source: "openai-vision",
          confidence: visionHit.confidence,
          localProductId: null,
          unitPriceCents: null,
          unitPriceLabel: null,
          priceFromLocalOnly: true,
        });
      }
    }

    // Tri + limite 5
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const top = suggestions.slice(0, 5);
    diagnostics.resultCount = top.length;

    const best = top[0] || null;
    const auto =
      best &&
      (best.confidence >= 0.9 ||
        best.source.startsWith("official:") ||
        (best.source === "local-catalog" && best.confidence >= 1) ||
        (best.barcode &&
          safeBarcode &&
          best.barcode === safeBarcode &&
          best.confidence >= 0.85));

    let failureReason: string | null = null;
    if (!top.length) {
      if (!safeBarcode && !query && !visionUsed) {
        failureReason =
          "Aucun EAN détecté et OCR Internet non disponible — présentez le code-barres ou saisissez le nom";
      } else if (!external.externalEnabled) {
        failureReason = "Recherche Internet désactivée (PRODUCT_IDENTIFY_EXTERNAL)";
      } else if (safeBarcode) {
        failureReason = `EAN ${safeBarcode} introuvable en local et sur les sources externes configurées`;
      } else if (ocrText) {
        failureReason = `Texte lu (« ${ocrText.slice(0, 80)} ») — aucune correspondance fiable`;
      } else if (visionUsed) {
        failureReason = "OCR/Vision n’a pas extrait assez d’informations fiables";
      } else {
        failureReason = "Aucun produit fiable trouvé";
      }
    } else if (!auto && top.length > 1) {
      failureReason = "Plusieurs résultats possibles — choisissez une suggestion";
    }

    const payload: Record<string, unknown> = {
      found: top.length > 0,
      autoFill: Boolean(auto && best),
      suggestion:
        auto && best && (top.length === 1 || best.confidence >= 0.92) ? best : null,
      suggestions: top,
      ocrText,
      effectiveBarcode: safeBarcode || effectiveBarcode,
      failureReason,
      message: auto && best
        ? "Produit identifié"
        : failureReason || "Résultats à confirmer",
    };

    if (process.env.NODE_ENV === "development") {
      payload.diagnostics = {
        ...diagnostics,
        visionUsed,
        ocrTextPreview: ocrText ? ocrText.slice(0, 120) : null,
      };
    }

    return jsonResponse(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
