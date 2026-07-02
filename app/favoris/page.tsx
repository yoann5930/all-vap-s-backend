"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/products/ProductGrid";
import { Button } from "@/components/ui/Button";
import type { Product } from "@prisma/client";

export default function FavorisPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => {
        if (r.status === 401) { window.location.href = "/login"; return []; }
        return r.json();
      })
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-gray-500">Chargement...</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-vap-black">Mes favoris</h1>
      {products.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-gray-500">Aucun favori pour le moment.</p>
          <Button href="/boutique" className="mt-4">Boutique</Button>
        </div>
      ) : (
        <div className="mt-8"><ProductGrid products={products} /></div>
      )}
    </div>
  );
}
