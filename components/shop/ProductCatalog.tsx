"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="premium-section-label">Catalogue</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#F5F7FA] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[#A7B0BC]">
          {data ? `${data.pagination.total} produit(s)` : "Chargement…"}
        </p>
      </div>

      <div className="mb-6">
        <InstantSearch />
      </div>

      <CategoryNav />

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
          value={searchParams.get("sort") || "newest"}
          onChange={(sort) => updateParams({ sort })}
        />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
          <div className="sticky top-36">
            <AdvancedFilters {...filterProps} />
          </div>
        </aside>

        <div className="flex-1">
          <div className="mb-6 hidden flex-wrap items-center justify-between gap-4 lg:flex">
            <p className="text-sm text-[#A7B0BC]">
              {data ? `${data.pagination.total} résultat(s)` : ""}
            </p>
            <ProductSort
              value={searchParams.get("sort") || "newest"}
              onChange={(sort) => updateParams({ sort })}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-80 animate-pulse rounded-2xl border border-white/6 bg-[#101720]"
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
                onClick={() => router.push("/boutique")}
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

        <aside className="hidden xl:block xl:w-64 xl:flex-shrink-0">
          <div className="sticky top-36 space-y-4 rounded-2xl border border-white/8 bg-[#101720] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-400">
              Conseils
            </p>
            <h2 className="font-display text-lg text-[#F5F7FA]">Besoin d&apos;aide ?</h2>
            <p className="text-sm leading-relaxed text-[#A7B0BC]">
              Nicotine, PG/VG, fraîcheur… nos boutiques Hautmont et Le Quesnoy
              vous conseillent. A.V.A. revient bientôt.
            </p>
            <Link
              href="/boutiques"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-500/35 bg-brand-500/15 px-4 text-sm text-brand-300"
            >
              Voir les boutiques
            </Link>
          </div>
        </aside>
      </div>

      {/* Tiroir filtres mobile */}
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
