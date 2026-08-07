import { AdminProductsClient } from "@/components/admin/AdminProductsClient";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getData() {
  try {
    const [rawProducts, categories, brands] = await Promise.all([
      prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          variants: {
            where: { active: true, barcode: { not: null } },
            take: 3,
            orderBy: { createdAt: "asc" },
            select: { barcode: true },
          },
        },
      }),
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
    ]);

    // Affiche le vrai EAN produit, sinon le premier EAN de variante en base (jamais inventé)
    const products = rawProducts.map((p) => {
      const { variants, ...rest } = p;
      const variantBarcode =
        variants.map((v) => v.barcode).find((b) => b && String(b).trim().length > 0) || null;
      return {
        ...rest,
        barcode: rest.barcode?.trim() || variantBarcode,
      };
    });

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
