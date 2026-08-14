import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { formatEuroFromCents } from "@/lib/inventory/pricing";
import { classifyInventoryBrandRange } from "@/lib/catalog/ranges-not-manufacturers";
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
      imageUrl: string | null;
      sumupProductId: string | null;
    };

    const suggestions: Suggestion[] = [];

    async function resolveLocalCatalog(params: {
      barcode?: string | null;
      name?: string | null;
      brand?: string | null;
    }): Promise<{
      id: string;
      priceCents: number;
      barcode: string | null;
      sumupProductId: string | null;
      name: string;
      brand: string | null;
      range: string | null;
      imageUrl: string | null;
      source: string | null;
    } | null> {
      if (params.barcode) {
        const byCode = await prisma.product.findFirst({
          where: {
            OR: [{ barcode: params.barcode }, { sku: params.barcode }],
          },
          select: {
            id: true,
            priceCents: true,
            barcode: true,
            sumupProductId: true,
            name: true,
            brand: true,
            range: true,
            imageUrl: true,
            source: true,
          },
        });
        if (byCode) return byCode;
      }
      const name = (params.name || "").trim();
      if (name.length < 4) return null;
      const tokens = name
        .toLowerCase()
        .split(/[^a-z0-9àâäéèêëïîôùûüç]+/i)
        .filter((t) => t.length >= 3)
        .slice(0, 5);
      if (!tokens.length) return null;
      const brand = (params.brand || "").trim();
      const candidates = await prisma.product.findMany({
        where: {
          AND: [
            brand
              ? {
                  OR: [
                    { brand: { contains: brand, mode: "insensitive" } },
                    { name: { contains: brand, mode: "insensitive" } },
                  ],
                }
              : {},
            {
              OR: tokens.map((t) => ({
                name: { contains: t, mode: "insensitive" as const },
              })),
            },
          ],
        },
        select: {
          id: true,
          priceCents: true,
          barcode: true,
          sumupProductId: true,
          name: true,
          brand: true,
          range: true,
          imageUrl: true,
          source: true,
        },
        take: 12,
      });
      if (!candidates.length) return null;
      // Préfère SumUp / barcode connu, puis meilleur recouvrement de tokens
      const scored = candidates
        .map((c) => {
          const hay = `${c.name} ${c.brand || ""}`.toLowerCase();
          const hit = tokens.filter((t) => hay.includes(t)).length;
          const bonus =
            (c.sumupProductId ? 0.15 : 0) +
            (c.source && /sumup/i.test(c.source) ? 0.1 : 0) +
            (c.barcode ? 0.05 : 0);
          return { c, score: hit / tokens.length + bonus };
        })
        .sort((a, b) => b.score - a.score);
      return scored[0] && scored[0].score >= 0.55 ? scored[0].c : null;
    }

    // Niveau 1 — local Prisma (lecture)
    diagnostics.localSearch = true;
    if (safeBarcode) {
      const local = await resolveLocalCatalog({ barcode: safeBarcode });
      if (local) {
        const priceOk = local.priceCents > 0;
        suggestions.push({
          name: local.name,
          brand: local.brand,
          range: local.range,
          barcode: local.barcode || safeBarcode,
          sku: null,
          source: "local-catalog",
          confidence: 1,
          localProductId: local.id,
          unitPriceCents: priceOk ? local.priceCents : null,
          unitPriceLabel: priceOk ? formatEuroFromCents(local.priceCents) : null,
          priceFromLocalOnly: true,
          imageUrl: local.imageUrl,
          sumupProductId: local.sumupProductId,
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
      // Prix / SumUp : rattachement catalogue local (EAN puis nom+marque)
      const local = await resolveLocalCatalog({
        barcode: hit.barcode || safeBarcode,
        name: hit.name,
        brand: hit.brand,
      });
      const priceOk = Boolean(local && local.priceCents > 0);
      suggestions.push({
        name: local?.name || hit.name,
        brand: local?.brand || hit.brand,
        range: local?.range || hit.range,
        barcode: local?.barcode || hit.barcode || safeBarcode,
        sku: hit.sku,
        source: hit.source,
        confidence: hit.confidence + (local?.sumupProductId ? 0.02 : 0),
        localProductId: local?.id || null,
        unitPriceCents: priceOk && local ? local.priceCents : null,
        unitPriceLabel:
          priceOk && local ? formatEuroFromCents(local.priceCents) : null,
        priceFromLocalOnly: true,
        imageUrl: local?.imageUrl || hit.imageUrl || null,
        sumupProductId: local?.sumupProductId || null,
      });
    }

    // Suggestion issue de la vision seule (si assez confiante et pas déjà couverte)
    if (visionHit?.name && visionHit.confidence >= 0.55) {
      const already = suggestions.some(
        (s) => s.name.toLowerCase() === visionHit!.name!.toLowerCase()
      );
      if (!already) {
        const local = await resolveLocalCatalog({
          barcode: visionHit.barcode || safeBarcode,
          name: visionHit.name,
          brand: visionHit.brand,
        });
        const priceOk = Boolean(local && local.priceCents > 0);
        suggestions.push({
          name: local?.name || visionHit.name,
          brand: local?.brand || visionHit.brand,
          range: local?.range || visionHit.range,
          barcode: local?.barcode || visionHit.barcode || safeBarcode,
          sku: null,
          source: "openai-vision",
          confidence: visionHit.confidence,
          localProductId: local?.id || null,
          unitPriceCents: priceOk && local ? local.priceCents : null,
          unitPriceLabel:
            priceOk && local ? formatEuroFromCents(local.priceCents) : null,
          priceFromLocalOnly: true,
          imageUrl: local?.imageUrl || null,
          sumupProductId: local?.sumupProductId || null,
        });
      }
    }

    // Tri + limite 5
    for (const s of suggestions) {
      const classified = classifyInventoryBrandRange({
        brand: s.brand,
        range: s.range,
      });
      s.brand = classified.brand;
      s.range = classified.range;
    }
    suggestions.sort((a, b) => b.confidence - a.confidence);
    const top = suggestions.slice(0, 5);
    diagnostics.resultCount = top.length;

    const best = top[0] || null;
    const second = top[1] || null;
    const clearGap = !second || best.confidence - second.confidence >= 0.12;
    const auto =
      best &&
      clearGap &&
      ((best.source === "local-catalog" && best.confidence >= 1) ||
        (best.barcode &&
          safeBarcode &&
          best.barcode === safeBarcode &&
          best.confidence >= 0.88) ||
        (best.source.startsWith("official:") &&
          best.confidence >= 0.9 &&
          (top.length === 1 || clearGap)) ||
        (best.confidence >= 0.93 && top.length === 1));

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
      suggestion: auto && best ? best : null,
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
