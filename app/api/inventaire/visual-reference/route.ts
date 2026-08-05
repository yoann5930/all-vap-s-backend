import { readFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/inventaire/visual-reference
 * Catalogue de référence FR + hash perceptuels précalculés (reconnaissance offline).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(
      `inventaire:visual-ref:${user.userId}:${ip}`,
      60,
      15 * 60 * 1000
    );
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de requêtes", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    // Préférer le fichier avec hash (reconnaissance 100% sans proxy client)
    const hashPath = join(process.cwd(), "data", "vape-fr-visual-hashes.json");
    const refPath = join(process.cwd(), "data", "vape-fr-reference-products.json");

    let data: {
      version?: number;
      generatedAt?: string;
      total?: number;
      withImage?: number;
      withHash?: number;
      brands?: Record<string, number>;
      products?: Array<{
        id: string;
        name: string;
        brand: string;
        range: string | null;
        barcode: string | null;
        imageUrl: string | null;
        source?: string;
        hash?: number[];
        colorHist?: number[];
      }>;
    } | null = null;

    try {
      data = JSON.parse(await readFile(hashPath, "utf8"));
    } catch {
      try {
        data = JSON.parse(await readFile(refPath, "utf8"));
      } catch {
        return jsonResponse({
          version: 0,
          products: [],
          total: 0,
          withImage: 0,
          withHash: 0,
          message: "Fichier de référence absent",
        });
      }
    }

    const products = (data?.products || [])
      .filter((p) => p.imageUrl && p.name)
      .slice(0, 800)
      .map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        range: p.range,
        category: p.range,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        priceCents: null as number | null,
        source: p.source,
        hash: Array.isArray(p.hash) && p.hash.length === 8 ? p.hash : null,
        colorHist:
          Array.isArray(p.colorHist) && p.colorHist.length === 64
            ? p.colorHist
            : null,
      }));

    const withHash = products.filter((p) => p.hash && p.colorHist).length;

    return jsonResponse({
      version: data?.version || 1,
      generatedAt: data?.generatedAt || null,
      total: data?.total || products.length,
      withImage: products.length,
      withHash,
      brands: data?.brands || {},
      products,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
