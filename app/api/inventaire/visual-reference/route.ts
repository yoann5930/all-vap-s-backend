import { readFile } from "fs/promises";
import { join } from "path";
import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/inventaire/visual-reference
 * Catalogue de référence FR (sites officiels) pour reconnaissance visuelle.
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

    const path = join(process.cwd(), "data", "vape-fr-reference-products.json");
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      return jsonResponse({
        version: 0,
        products: [],
        total: 0,
        withImage: 0,
        message: "Fichier de référence absent — lancez scripts/build-vape-fr-reference.ts",
      });
    }

    const data = JSON.parse(raw) as {
      version?: number;
      generatedAt?: string;
      total?: number;
      withImage?: number;
      brands?: Record<string, number>;
      products?: Array<{
        id: string;
        name: string;
        brand: string;
        range: string | null;
        barcode: string | null;
        imageUrl: string | null;
        source: string;
      }>;
    };

    const products = (data.products || [])
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
      }));

    return jsonResponse({
      version: data.version || 1,
      generatedAt: data.generatedAt || null,
      total: data.total || products.length,
      withImage: data.withImage || products.length,
      brands: data.brands || {},
      products,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
