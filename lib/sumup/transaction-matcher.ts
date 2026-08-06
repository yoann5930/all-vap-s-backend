/**
 * Rapprochement transaction SumUp → produit catalogue PostgreSQL.
 */
import prisma from "@/lib/prisma";
import { normalizeProductName } from "@/lib/catalog/normalize";
import {
  matchCatalogProduct,
  type CatalogMatchCandidate,
  type MatchResult,
} from "@/lib/catalog/matching";
import type { SumUpTransactionProduct } from "@/lib/sumup/api-client";

let catalogCache: CatalogMatchCandidate[] | null = null;
let catalogCacheAt = 0;
const CACHE_TTL_MS = 60_000;

export async function loadCatalogCandidates(): Promise<CatalogMatchCandidate[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < CACHE_TTL_MS) return catalogCache;
  // Liste blanche stricte : seuls les produits validés/actifs participent à la sync.
  // Les produits a_verifier / brut_importe restent exclus (catalogue brut).
  catalogCache = await prisma.product.findMany({
    where: {
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
      sumupProductId: { not: null },
    },
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
  catalogCacheAt = now;
  return catalogCache;
}

export function matchSumUpProductLine(
  line: SumUpTransactionProduct,
  catalog: CatalogMatchCandidate[]
): MatchResult & { sourceName: string } {
  const name = (line.name || "").trim();
  const norm = normalizeProductName(name);
  return {
    sourceName: name,
    ...matchCatalogProduct(
      {
        name,
        normalizedName: norm,
        sumupProductId: null,
        sku: null,
        barcode: null,
      },
      catalog
    ),
  };
}

export function invalidateCatalogCache() {
  catalogCache = null;
  catalogCacheAt = 0;
}
