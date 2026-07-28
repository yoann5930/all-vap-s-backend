"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { ProductGrid } from "@/components/products/ProductGrid";
import { AdvancedFilters } from "@/components/shop/AdvancedFilters";
import { ProductSort } from "@/components/shop/ProductSort";
import { ProductPagination } from "@/components/shop/ProductPagination";
import { AvaSidePanel } from "@/components/home/AvaSidePanel";
import { getCategoryBySlug } from "@/lib/catalog/categories";
import type { Product, Category, Brand } from "@prisma/client";

interface CatalogResponse {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function ProductCatalog({
  defaultCategory,
  showAvaPanel = true,
  heading,
  embedded = false,
}: {
  defaultCategory?: string;
  showAvaPanel?: boolean;
  heading?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = searchParams.toString();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(queryString);
      if (defaultCategory && !params.get("category")) {
        params.set("category", defaultCategory);
      }
      if (!params.get("limit")) params.set("limit", "20");
      const res = await fetch(`/api/products?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString, defaultCategory]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    document.body.style.overflow = filtersOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersOpen]);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    });
    if (!updates.page) params.set("page", "1");
    const base = defaultCategory ? "/e-liquides" : "/boutique";
    // e-liquides redirects to boutique?category= — keep boutique for query updates
    router.push(`/boutique?${params.toString()}`);
    void base;
  }

  const categorySlug = searchParams.get("category") || defaultCategory || null;
  const categoryName = categorySlug ? getCategoryBySlug(categorySlug)?.name : null;

  const title =
    heading ||
    (searchParams.get("promo")
      ? "Promotions"
      : searchParams.get("new")
        ? "Nouveautés"
        : categoryName ||
          (categorySlug ? `Catégorie : ${categorySlug}` : "E-LIQUIDES"));

  const filterProps = {
    categories: data?.categories || [],
    brands: data?.brands || [],
    searchParams,
    onUpdate: (u: Record<string, string | null>) => {
      updateParams(u);
      setFiltersOpen(false);
    },
  };

  return (
    <div className={embedded ? "" : "mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"}>
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#101720] px-4 text-sm text-[#F5F7FA]"
        >
          <Filter className="h-4 w-4 text-brand-400" />
          Filtres
        </button>
        <ProductSort
          value={searchParams.get("sort") || "bestseller"}
          onChange={(sort) => updateParams({ sort })}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <aside className="hidden w-[220px] shrink-0 lg:block">
          <div className="sticky top-36">
            <AdvancedFilters {...filterProps} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-white sm:text-[1.75rem]">
                {title}
              </h2>
              <p className="mt-1 text-sm text-[#A7B0BC]">
                {data ? `${data.pagination.total} produits trouvés` : "Chargement…"}
              </p>
            </div>
            <div className="hidden lg:block">
              <ProductSort
                value={searchParams.get("sort") || "bestseller"}
                onChange={(sort) => updateParams({ sort })}
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-72 animate-pulse rounded-2xl border border-white/6 bg-[#101720]"
                />
              ))}
            </div>
          ) : (data?.products.length || 0) === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#101720] px-6 py-16 text-center">
              <p className="font-display text-lg text-[#F5F7FA]">Aucun produit trouvé</p>
              <p className="mt-2 text-sm text-[#A7B0BC]">
                Modifiez vos filtres ou réessayez une autre recherche.
              </p>
              <button
                type="button"
                onClick={() => router.push("/boutique?category=e-liquides")}
                className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-brand-500/35 bg-brand-500/15 px-5 text-sm text-brand-300"
              >
                Réinitialiser
              </button>
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

        {showAvaPanel && (
          <aside className="hidden w-[280px] shrink-0 xl:block">
            <div className="sticky top-36">
              <AvaSidePanel />
            </div>
          </aside>
        )}
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setFiltersOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-[#05070A] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
              <h2 className="font-display text-lg text-[#F5F7FA]">Filtres</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-xl p-2 text-[#A7B0BC] hover:bg-white/5 hover:text-white"
                aria-label="Fermer les filtres"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <AdvancedFilters {...filterProps} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
