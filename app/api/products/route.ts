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

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  sku: z.string().optional().nullable(),
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

    const [products, total, categories, brands] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: params.limit || 12,
        include: { categoryRef: true, brandRef: true },
      }),
      prisma.product.count({ where }),
      prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);

    return jsonResponse({
      products,
      categories,
      brands,
      pagination: {
        page: params.page || 1,
        limit: params.limit || 12,
        total,
        totalPages: Math.ceil(total / (params.limit || 12)),
      },
    });
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

    const product = await prisma.product.create({
      data: { ...data, slug },
    });

    return jsonResponse(product, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
