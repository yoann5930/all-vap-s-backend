import type { Prisma } from "@prisma/client";
import {
  applyCatalogFiltersToWhere,
  buildEnhancedSearchWhere,
  type CatalogFilterParams,
} from "@/lib/catalog/filters";

export type ProductSort =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "bestseller";

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  isNew?: boolean;
  isBestSeller?: boolean;
  isPromo?: boolean;
  inStock?: boolean;
  includeInactive?: boolean;
  nicotine?: string;
  pgvg?: string;
  gamme?: string;
  saveur?: string;
  fabricant?: string;
  format?: string;
  disponibilite?: "in_stock" | "out_of_stock";
  fruit?: boolean;
  menthole?: boolean;
  boisson?: boolean;
  dessert?: boolean;
  tabac?: boolean;
  bonbon?: boolean;
  frais?: boolean;
  tresFrais?: boolean;
  sucre?: boolean;
  acidule?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function buildProductWhere(params: ProductQueryParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    ...(params.includeInactive
      ? {}
      : {
          isActive: true,
          visibleOnline: true,
          catalogStatus: { in: ["valide", "actif"] },
          manufacturerId: { not: null },
          rangeId: { not: null },
        }),
    ...(params.isNew ? { isNew: true } : {}),
    ...(params.isBestSeller ? { isBestSeller: true } : {}),
    ...(params.isPromo ? { isPromo: true } : {}),
  };

  if (params.category) {
    where.OR = [
      { category: { equals: params.category, mode: "insensitive" } },
      { categoryRef: { slug: params.category } },
    ];
  }

  if (params.brand) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { brand: { equals: params.brand, mode: "insensitive" } },
          { brandRef: { slug: params.brand } },
        ],
      },
    ];
  }

  if (params.search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      buildEnhancedSearchWhere(params.search),
    ];
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        priceCents: {
          ...(params.minPrice !== undefined ? { gte: params.minPrice } : {}),
          ...(params.maxPrice !== undefined ? { lte: params.maxPrice } : {}),
        },
      },
    ];
  }

  const catalogFilters: CatalogFilterParams = {
    fabricant: params.fabricant || params.brand,
    gamme: params.gamme,
    saveur: params.saveur,
    fruit: params.fruit,
    menthole: params.menthole,
    boisson: params.boisson,
    dessert: params.dessert,
    tabac: params.tabac,
    bonbon: params.bonbon,
    frais: params.frais,
    tresFrais: params.tresFrais,
    sucre: params.sucre,
    acidule: params.acidule,
    pgvg: params.pgvg,
    nicotine: params.nicotine,
    format: params.format,
    disponibilite:
      params.disponibilite === "in_stock" || params.disponibilite === "out_of_stock"
        ? params.disponibilite
        : params.inStock
          ? "in_stock"
          : undefined,
  };

  return applyCatalogFiltersToWhere(where, catalogFilters);
}

export function buildProductOrderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "price-asc":
      return { priceCents: "asc" };
    case "price-desc":
      return { priceCents: "desc" };
    case "name-asc":
      return { name: "asc" };
    case "bestseller":
      return { salesCount: "desc" };
    case "newest":
    default:
      return { sortOrder: "asc" };
  }
}

export function parseProductQuery(searchParams: URLSearchParams): ProductQueryParams {
  const bool = (key: string) => searchParams.get(key) === "true" || searchParams.get(key) === "1";

  return {
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10)),
    limit: Math.min(48, Math.max(1, parseInt(searchParams.get("limit") || "12", 10))),
    search: searchParams.get("search") || undefined,
    category: searchParams.get("category") || undefined,
    brand: searchParams.get("brand") || searchParams.get("fabricant") || undefined,
    fabricant: searchParams.get("fabricant") || searchParams.get("brand") || undefined,
    gamme: searchParams.get("gamme") || searchParams.get("range") || undefined,
    saveur: searchParams.get("saveur") || searchParams.get("flavor") || undefined,
    minPrice: searchParams.get("minPrice")
      ? parseInt(searchParams.get("minPrice")!, 10)
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? parseInt(searchParams.get("maxPrice")!, 10)
      : undefined,
    sort: (searchParams.get("sort") as ProductSort) || "bestseller",
    isNew: searchParams.get("new") === "true",
    isBestSeller: searchParams.get("bestseller") === "true",
    isPromo: searchParams.get("promo") === "true" || searchParams.get("promo") === "1",
    inStock: searchParams.get("inStock") === "true" || searchParams.get("disponibilite") === "in_stock",
    nicotine: searchParams.get("nicotine") || undefined,
    pgvg: searchParams.get("pgvg") || undefined,
    format: searchParams.get("format") || undefined,
    disponibilite:
      searchParams.get("disponibilite") === "in_stock"
        ? "in_stock"
        : searchParams.get("disponibilite") === "out_of_stock"
          ? "out_of_stock"
          : undefined,
    includeInactive: searchParams.get("all") === "true",
    fruit: bool("fruit"),
    menthole: bool("menthole") || bool("mint"),
    boisson: bool("boisson") || bool("drink"),
    dessert: bool("dessert") || bool("gourmet"),
    tabac: bool("tabac") || bool("tobacco"),
    bonbon: bool("bonbon") || bool("candy"),
    frais: bool("frais") || bool("fresh"),
    tresFrais: bool("tres_frais"),
    sucre: bool("sucre") || bool("sweet"),
    acidule: bool("acidule") || bool("sour"),
  };
}

export function getEffectivePrice(product: {
  priceCents: number;
  promoPriceCents?: number | null;
  isPromo?: boolean;
}): number {
  if (product.isPromo && product.promoPriceCents) {
    return product.promoPriceCents;
  }
  return product.priceCents;
}
