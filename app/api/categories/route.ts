import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { CATALOG_CATEGORIES, CATEGORY_GROUPS } from "@/lib/catalog/categories";

export async function GET() {
  try {
    const dbCategories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: true } } },
    });

    return jsonResponse({
      categories: dbCategories.length > 0 ? dbCategories : CATALOG_CATEGORIES,
      groups: CATEGORY_GROUPS,
      catalog: CATALOG_CATEGORIES,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
