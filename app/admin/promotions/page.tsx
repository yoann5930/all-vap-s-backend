"use client";

import { useEffect, useState } from "react";

export default function AdminPromotionsPage() {
  const [products, setProducts] = useState<Array<{ id: string; name: string; isPromo: boolean; isNew: boolean; isBestSeller: boolean }>>([]);

  useEffect(() => {
    fetch("/api/products?legacy=true&all=true").then((r) => r.json()).then(setProducts);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Promotions & badges</h1>
      <p className="mt-1 text-gray-600">Gérez les produits en promotion, nouveautés et best-sellers depuis la fiche produit.</p>
      <div className="mt-6 space-y-2">
        {products.filter((p) => p.isPromo || p.isNew || p.isBestSeller).map((p) => (
          <div key={p.id} className="flex gap-2 rounded-lg border px-4 py-3 text-sm">
            <span className="font-medium">{p.name}</span>
            {p.isPromo && <span className="rounded bg-red-100 px-2 text-red-700">Promo</span>}
            {p.isNew && <span className="rounded bg-blue-100 px-2 text-blue-700">Nouveau</span>}
            {p.isBestSeller && <span className="rounded bg-amber-100 px-2 text-amber-700">Best-seller</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
