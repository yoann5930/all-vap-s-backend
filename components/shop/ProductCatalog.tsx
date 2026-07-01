"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductGrid } from "@/components/products/ProductGrid";
import { AdvancedFilters } from "@/components/shop/AdvancedFilters";
import { ProductSort } from "@/components/shop/ProductSort";
import { ProductPagination } from "@/components/shop/ProductPagination";
import { InstantSearch } from "@/components/shop/InstantSearch";
import { CategoryNav } from "@/components/shop/CategoryNav";
import { getCategoryBySlug } from "@/lib/catalog/categories";
import type { Product, Category, Brand } from "@prisma/client";

interface CatalogResponse {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function ProductCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const queryString = searchParams.toString();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products?${queryString}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    });
    if (!updates.page) params.set("page", "1");
    router.push(`/boutique?${params.toString()}`);
  }

  const categorySlug = searchParams.get("category");
  const categoryName = categorySlug ? getCategoryBySlug(categorySlug)?.name : null;

  const title = searchParams.get("promo")
    ? "Promotions"
    : searchParams.get("new")
    ? "Nouveautés"
    : searchParams.get("bestseller")
    ? "Meilleures ventes"
    : categoryName || (categorySlug ? `Catégorie : ${categorySlug}` : "Boutique");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-vap-black">{title}</h1>
        <p className="mt-1 text-gray-600">
          {data ? `${data.pagination.total} produit(s)` : "Chargement..."}
        </p>
      </div>

      <div className="mb-6">
        <InstantSearch />
      </div>

      <CategoryNav />

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="lg:w-64 lg:flex-shrink-0">
          <AdvancedFilters
            categories={data?.categories || []}
            brands={data?.brands || []}
            searchParams={searchParams}
            onUpdate={updateParams}
          />
        </aside>

        <div className="flex-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <ProductSort
              value={searchParams.get("sort") || "newest"}
              onChange={(sort) => updateParams({ sort })}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : (
            <>
              <ProductGrid products={data?.products || []} />
              {data && data.pagination.totalPages > 1 && (
                <ProductPagination
                  pagination={data.pagination}
                  onPageChange={(page) => updateParams({ page: String(page) })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
