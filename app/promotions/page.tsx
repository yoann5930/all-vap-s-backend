import Link from "next/link";
import { Tag } from "lucide-react";
import { ProductGrid } from "@/components/products/ProductGrid";
import prisma from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Promotions",
  description: "Promotions et offres All Vap's — cigarettes électroniques, e-liquides et accessoires à Hautmont et Le Quesnoy.",
  alternates: { canonical: absoluteUrl("/promotions") },
};

async function getPromoProducts() {
  try {
    return await prisma.product.findMany({
      where: { isActive: true, isPromo: true },
    });
  } catch {
    return [];
  }
}

export default async function PromotionsPage() {
  const products = await getPromoProducts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <Tag className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="mt-4 text-3xl font-bold text-vap-black">Promotions</h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-600">
          Profitez de nos meilleures offres sur une sélection de produits All Vap&apos;s.
        </p>
      </div>
      <ProductGrid products={products} />
      <p className="mt-12 text-center text-sm text-gray-500">
        <Link href="/" className="text-brand-700 hover:underline">
          ← Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}
