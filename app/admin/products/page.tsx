import { AdminProductsClient } from "@/components/admin/AdminProductsClient";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getData() {
  try {
    const [products, categories, brands] = await Promise.all([
      prisma.product.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { products, categories, brands };
  } catch {
    return { products: [], categories: [], brands: [] };
  }
}

export default async function AdminProductsPage() {
  const { products, categories, brands } = await getData();
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
      </div>
      <AdminProductsClient initialProducts={products} categories={categories} brands={brands} />
    </div>
  );
}
