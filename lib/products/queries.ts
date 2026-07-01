import type { Prisma } from "@prisma/client";

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
    ...(params.includeInactive ? {} : { isActive: true }),
    ...(params.isNew ? { isNew: true } : {}),
    ...(params.isBestSeller ? { isBestSeller: true } : {}),
    ...(params.isPromo ? { isPromo: true } : {}),
    ...(params.inStock ? { stock: { gt: 0 } } : {}),
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
      {
        OR: [
          { name: { contains: params.search, mode: "insensitive" } },
          { description: { contains: params.search, mode: "insensitive" } },
          { brand: { contains: params.search, mode: "insensitive" } },
          { category: { contains: params.search, mode: "insensitive" } },
          { sku: { contains: params.search, mode: "insensitive" } },
        ],
      },
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

  return where;
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
      return { createdAt: "desc" };
  }
}

export function parseProductQuery(searchParams: URLSearchParams): ProductQueryParams {
  return {
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10)),
    limit: Math.min(48, Math.max(1, parseInt(searchParams.get("limit") || "12", 10))),
    search: searchParams.get("search") || undefined,
    category: searchParams.get("category") || undefined,
    brand: searchParams.get("brand") || undefined,
    minPrice: searchParams.get("minPrice")
      ? parseInt(searchParams.get("minPrice")!, 10)
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? parseInt(searchParams.get("maxPrice")!, 10)
      : undefined,
    sort: (searchParams.get("sort") as ProductSort) || "newest",
    isNew: searchParams.get("new") === "true",
    isBestSeller: searchParams.get("bestseller") === "true",
    isPromo: searchParams.get("promo") === "true" || searchParams.get("promo") === "1",
    inStock: searchParams.get("inStock") === "true",
    includeInactive: searchParams.get("all") === "true",
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
