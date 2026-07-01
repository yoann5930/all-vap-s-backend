import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { slugify } from "@/lib/utils";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const brandSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  logoUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    const [categories, brands] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } }),
      prisma.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
    ]);

    return jsonResponse({ categories, brands, catalog: CATALOG_CATEGORIES });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const type = new URL(request.url).searchParams.get("type");
    const body = await request.json();

    if (type === "brand") {
      const data = brandSchema.parse(body);
      const brand = await prisma.brand.create({
        data: { ...data, slug: data.slug || slugify(data.name) },
      });
      return jsonResponse(brand, 201);
    }

    if (type === "sync-catalog") {
      for (const cat of CATALOG_CATEGORIES) {
        await prisma.category.upsert({
          where: { slug: cat.slug },
          update: { name: cat.name, description: cat.description, sortOrder: cat.sortOrder },
          create: { name: cat.name, slug: cat.slug, description: cat.description, sortOrder: cat.sortOrder },
        });
      }
      const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
      return jsonResponse({ synced: categories.length, categories });
    }

    const data = categorySchema.parse(body);
    const category = await prisma.category.create({
      data: { ...data, slug: data.slug || slugify(data.name) },
    });
    return jsonResponse(category, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const type = new URL(request.url).searchParams.get("type");
    const { id, ...body } = await request.json();

    if (type === "brand") {
      const brand = await prisma.brand.update({ where: { id }, data: body });
      return jsonResponse(brand);
    }

    const category = await prisma.category.update({ where: { id }, data: body });
    return jsonResponse(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");
    if (!id) throw new Error("NOT_FOUND");

    if (type === "brand") {
      await prisma.brand.delete({ where: { id } });
    } else {
      await prisma.category.delete({ where: { id } });
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
