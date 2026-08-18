import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { slugify } from "@/lib/utils";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { normalizeProductImageFields } from "@/lib/catalog/product-image-fields";
import {
  buildProductWhere,
  buildProductOrderBy,
  parseProductQuery,
} from "@/lib/products/queries";

type CatalogMeta = {
  categories: Array<{ id: string; name: string; slug: string; sortOrder: number }>;
  brands: Array<{ id: string; name: string; slug: string }>;
  expiresAt: number;
};

let catalogMetaCache: CatalogMeta | null = null;
const CATALOG_META_TTL_MS = 60_000;

async function getCatalogMeta() {
  const now = Date.now();
  if (catalogMetaCache && catalogMetaCache.expiresAt > now) {
    return catalogMetaCache;
  }
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, sortOrder: true },
    }),
    prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);
  catalogMetaCache = { categories, brands, expiresAt: now + CATALOG_META_TTL_MS };
  return catalogMetaCache;
}

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  sku: z.string().optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().min(2),
  brand: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  images: z.array(z.string().url()).optional(),
  priceCents: z.number().int().positive(),
  promoPriceCents: z.number().int().positive().optional().nullable(),
  stock: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isNew: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isPromo: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const params = parseProductQuery(new URL(request.url).searchParams);
    const legacyList = new URL(request.url).searchParams.get("legacy") === "true";

    let includeInactive = params.includeInactive;
    if (includeInactive) {
      try {
        const user = await requireAuth();
        includeInactive = user.role === "ADMIN";
      } catch {
        includeInactive = false;
      }
    }

    const where = buildProductWhere({ ...params, includeInactive });
    const orderBy = buildProductOrderBy(params.sort);

    if (legacyList) {
      const products = await prisma.product.findMany({ where, orderBy });
      return jsonResponse(products);
    }

    const skip = ((params.page || 1) - 1) * (params.limit || 12);

    const [products, total, meta] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: params.limit || 12,
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
          barcode: true,
          description: true,
          category: true,
          brand: true,
          imageUrl: true,
          images: true,
          priceCents: true,
          promoPriceCents: true,
          stock: true,
          salesCount: true,
          isActive: true,
          isNew: true,
          isBestSeller: true,
          isPromo: true,
          categoryRef: { select: { id: true, name: true, slug: true } },
          brandRef: { select: { id: true, name: true, slug: true } },
          stockLevels: {
            where: { location: { code: { in: ["HAUTMONT", "LE_QUESNOY"] } } },
            select: {
              quantity: true,
              availableQuantity: true,
              location: { select: { code: true } },
            },
          },
        },
      }),
      prisma.product.count({ where }),
      getCatalogMeta(),
    ]);

    const productsWithDualStock = products.map((p) => {
      const hautmont =
        p.stockLevels
          .filter((l) => l.location.code === "HAUTMONT")
          .reduce((s, l) => s + l.quantity, 0);
      const leQuesnoy =
        p.stockLevels
          .filter((l) => l.location.code === "LE_QUESNOY")
          .reduce((s, l) => s + l.quantity, 0);
      const { stockLevels: _, ...rest } = p;
      void _;
      return {
        ...rest,
        stockHautmont: hautmont,
        stockLeQuesnoy: leQuesnoy,
        stock: hautmont + leQuesnoy > 0 || p.stockLevels.length > 0 ? hautmont + leQuesnoy : p.stock,
      };
    });

    const response = jsonResponse({
      products: productsWithDualStock,
      categories: meta.categories,
      brands: meta.brands,
      pagination: {
        page: params.page || 1,
        limit: params.limit || 12,
        total,
        totalPages: Math.ceil(total / (params.limit || 12)),
      },
    });
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const body = await request.json();
    const data = productSchema.parse(body);
    const slug = data.slug || slugify(data.name);
    const normalizedImages = await normalizeProductImageFields(
      {
        productName: data.name,
        brand: data.brand,
        productSlug: slug,
      },
      {
        ...(Object.prototype.hasOwnProperty.call(data, "imageUrl") ? { imageUrl: data.imageUrl } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "images") ? { images: data.images } : {}),
      }
    );

    const product = await prisma.product.create({
      data: { ...data, ...normalizedImages, slug },
    });

    try {
      const { classifyProductById } = await import(
        "@/lib/catalog/classification-engine"
      );
      await classifyProductById({
        productId: product.id,
        source: "product_upsert",
        barcodeHint: product.barcode,
        apply: true,
      });
    } catch (e) {
      console.error("[classification-engine] product POST", e);
    }

    return jsonResponse(product, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
