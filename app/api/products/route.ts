import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { slugify } from "@/lib/utils";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
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
  description: z.string().optional().nullable(),
  category: z.string().min(2),
  brand: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  imageUrl: z
    .string()
    .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "URL image invalide")
    .optional()
    .nullable(),
  images: z
    .array(
      z.string().refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "URL image invalide")
    )
    .optional(),
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

    const [products, total, meta, ranges] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: params.limit || 12,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          shortDescription: true,
          category: true,
          brand: true,
          range: true,
          sku: true,
          reference: true,
          barcode: true,
          imageUrl: true,
          imageStatus: true,
          images: true,
          priceCents: true,
          promoPriceCents: true,
          stock: true,
          salesCount: true,
          isActive: true,
          isNew: true,
          isBestSeller: true,
          isPromo: true,
          productType: true,
          volumeMl: true,
          promotion10mlEligible: true,
          catalogStatus: true,
          sortOrder: true,
          visibleOnline: true,
          categoryRef: { select: { id: true, name: true, slug: true } },
          brandRef: { select: { id: true, name: true, slug: true } },
          rangeRef: { select: { id: true, name: true, slug: true } },
          flavors: {
            select: {
              primaryFlavor: true,
              secondaryFlavor: true,
              flavorFamily: true,
              isFresh: true,
              isFruity: true,
            },
          },
          variants: {
            where: { active: true },
            select: {
              id: true,
              name: true,
              active: true,
              nicotineMg: true,
              nicotineLabel: true,
              capacityMl: true,
              pgVgLabel: true,
              priceCents: true,
              stock: true,
              barcode: true,
              sumupProductId: true,
              sumupVariantId: true,
            },
            orderBy: { nicotineMg: "asc" },
          },
          catalogImages: {
            where: { status: { in: ["validated", "official"] } },
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { url: true, status: true },
          },
        },
      }),
      prisma.product.count({ where }),
      getCatalogMeta(),
      prisma.productRange.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, slug: true, brandId: true },
      }),
    ]);

    const response = jsonResponse({
      products,
      categories: meta.categories,
      brands: meta.brands,
      ranges,
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

    let imageUrl = data.imageUrl ?? null;
    if (imageUrl) {
      const { ensureProductImageEtastyStyle } = await import(
        "@/lib/catalog/normalize-product-image"
      );
      imageUrl = await ensureProductImageEtastyStyle({
        sourceUrl: imageUrl,
        productName: data.name,
        brand: data.brand,
        productSlug: slug,
      });
    }

    const product = await prisma.product.create({
      data: { ...data, slug, imageUrl },
    });

    return jsonResponse(product, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
