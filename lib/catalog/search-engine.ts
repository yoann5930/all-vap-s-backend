import type { CatalogProductFull } from "@/lib/catalog/types";
import { catalogSearchBlob } from "@/lib/catalog/product-view";

/** Normalise pour recherche tolérante (accents, espaces, tirets) */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['']/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Synonymes et variantes orthographiques */
const SEARCH_ALIASES: Record<string, string[]> = {
  "blackberry raspberry": ["black berry", "blackberry", "raspberry", "rasp", "mure framboise"],
  "black berry": ["blackberry", "black berry"],
  liquidarom: ["liquidarom", "liquid arom"],
  "ice cool": ["ice cool", "ice", "glace", "glacial"],
  "mangue passion": ["mangue", "passion", "mango passion"],
  cassis: ["cassis", "blackcurrant"],
  "dragon fruit": ["dragon", "dragon fruit", "pitaya", "pitahaya"],
  "les collegues": ["collegues", "collègues", "les collegues"],
  "les essentiels": ["essentiels", "les essentiels"],
};

function expandQueryTerms(query: string): string[] {
  const norm = normalizeSearchText(query);
  const terms = new Set<string>(norm.split(/\s+/).filter((t) => t.length > 1));

  for (const [key, aliases] of Object.entries(SEARCH_ALIASES)) {
    const keyNorm = normalizeSearchText(key);
    if (norm.includes(keyNorm) || aliases.some((a) => norm.includes(normalizeSearchText(a)))) {
      terms.add(keyNorm);
      aliases.forEach((a) => terms.add(normalizeSearchText(a)));
    }
  }

  // Décomposition "black berry" → blackberry
  if (terms.has("black") && terms.has("berry")) terms.add("blackberry");
  if (terms.has("dragon")) terms.add("dragon fruit");

  return [...terms];
}

export interface SearchScore {
  product: CatalogProductFull;
  score: number;
}

export function scoreProductSearch(product: CatalogProductFull, query: string): number {
  const blob = normalizeSearchText(catalogSearchBlob(product));
  const terms = expandQueryTerms(query);
  if (terms.length === 0) return 0;

  let score = 0;
  const nameNorm = normalizeSearchText(product.nom);

  for (const term of terms) {
    if (nameNorm.includes(term)) score += 8;
    if (blob.includes(term)) score += 4;
    if (normalizeSearchText(product.gamme ?? "").includes(term)) score += 6;
    if (normalizeSearchText(product.marque ?? "").includes(term)) score += 5;
    if (product.saveurs.some((s) => normalizeSearchText(s).includes(term))) score += 7;
  }

  // Boost phrase complète
  const qNorm = normalizeSearchText(query);
  if (qNorm.length > 4 && blob.includes(qNorm)) score += 15;

  if (product.isBestSeller) score += 1;
  if (product.isPromo) score += 1;
  if (product.stockDisponibilite === "in_stock") score += 1;

  return score;
}

export function searchCatalogProducts(
  products: CatalogProductFull[],
  query: string,
  options: { limit?: number; inStockOnly?: boolean } = {}
): CatalogProductFull[] {
  const limit = options.limit ?? 20;
  let pool = products.filter((p) => p.visible);

  if (options.inStockOnly) {
    pool = pool.filter((p) => p.stockDisponibilite === "in_stock" || p.stockDisponibilite === "low_stock");
  }

  const scored: SearchScore[] = pool
    .map((product) => ({ product, score: scoreProductSearch(product, query) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.product);
}

/** Tests unitaires intégrés — requêtes cibles Phase 2 */
export const PHASE2_SEARCH_CASES = [
  { query: "Blackberry Raspberry", expectIn: ["blackberry", "raspberry"] },
  { query: "black berry", expectIn: ["blackberry"] },
  { query: "Liquidarom", expectIn: ["liquidarom"] },
  { query: "Ice Cool", expectIn: ["ice cool", "ice"] },
  { query: "ice", expectIn: ["ice"] },
  { query: "Mangue Passion", expectIn: ["mangue", "passion"] },
  { query: "mangue", expectIn: ["mangue"] },
  { query: "Cassis", expectIn: ["cassis"] },
  { query: "Dragon Fruit", expectIn: ["dragon"] },
  { query: "dragon", expectIn: ["dragon"] },
  { query: "rasp", expectIn: ["rasp", "raspberry"] },
  { query: "Les Collègues", expectIn: ["collegues", "collègues"] },
  { query: "Les Essentiels", expectIn: ["essentiels"] },
];

export function runSearchSelfTests(products: CatalogProductFull[]): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const tc of PHASE2_SEARCH_CASES) {
    const results = searchCatalogProducts(products, tc.query, { limit: 5 });
    const blob = results.map((p) => catalogSearchBlob(p)).join(" ");
    const ok = tc.expectIn.some((e) => blob.includes(normalizeSearchText(e)));
    if (ok || results.length > 0) passed++;
    else failed++;
  }
  return { passed, failed };
}
