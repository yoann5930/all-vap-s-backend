import { ProductCard } from "./ProductCard";
import type { Product } from "@prisma/client";

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#1C2430] bg-[#0B0F14] py-16 text-center">
        <p className="text-[#A7B0BC]">Aucun produit disponible pour le moment.</p>
        <p className="mt-1 text-sm text-[#A7B0BC]/70">
          Catalogue en cours de synchronisation — réessayez dans un instant.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
