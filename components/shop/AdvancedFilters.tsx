"use client";

import type { Category, Brand } from "@prisma/client";
import { CATEGORY_GROUPS, CATALOG_CATEGORIES } from "@/lib/catalog/categories";
import { cn } from "@/lib/utils";

interface AdvancedFiltersProps {
  categories: Category[];
  brands: Brand[];
  searchParams: URLSearchParams;
  onUpdate: (updates: Record<string, string | null>) => void;
}

export function AdvancedFilters({ categories, brands, searchParams, onUpdate }: AdvancedFiltersProps) {
  const currentCategory = searchParams.get("category");
  const currentBrand = searchParams.get("brand");
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";

  const categoryList = categories.length > 0
    ? categories.map((c) => ({ name: c.name, slug: c.slug }))
    : CATALOG_CATEGORIES.map((c) => ({ name: c.name, slug: c.slug }));

  return (
    <div className="space-y-6 rounded-xl border border-wood-200/60 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-vap-black">Catégories</h3>
        <button
          onClick={() => onUpdate({ category: null })}
          className={cn(
            "mt-3 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
            !currentCategory ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
          )}
        >
          Toutes
        </button>
        {CATEGORY_GROUPS.map((group) => {
          const groupCats = categoryList.filter((c) =>
            CATALOG_CATEGORIES.find((cc) => cc.slug === c.slug)?.group === group.id
          );
          if (groupCats.length === 0) return null;
          return (
            <div key={group.id} className="mt-4">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
              <ul className="mt-1 space-y-0.5">
                {groupCats.map((cat) => (
                  <li key={cat.slug}>
                    <button
                      onClick={() => onUpdate({ category: cat.slug })}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        currentCategory === cat.slug ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      {cat.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {brands.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-vap-black">Marques</h3>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
            {brands.map((brand) => (
              <li key={brand.id}>
                <button
                  onClick={() => onUpdate({ brand: currentBrand === brand.slug ? null : brand.slug })}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    currentBrand === brand.slug ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {brand.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-vap-black">Prix (€)</h3>
        <div className="mt-3 flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={minPrice ? String(parseInt(minPrice) / 100) : ""}
            onChange={(e) => onUpdate({ minPrice: e.target.value ? String(parseInt(e.target.value) * 100) : null })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Max"
            value={maxPrice ? String(parseInt(maxPrice) / 100) : ""}
            onChange={(e) => onUpdate({ maxPrice: e.target.value ? String(parseInt(e.target.value) * 100) : null })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <FilterToggle label="En stock uniquement" param="inStock" value="true" searchParams={searchParams} onUpdate={onUpdate} />
        <FilterToggle label="Nouveautés" param="new" value="true" searchParams={searchParams} onUpdate={onUpdate} />
        <FilterToggle label="Meilleures ventes" param="bestseller" value="true" searchParams={searchParams} onUpdate={onUpdate} />
        <FilterToggle label="Promotions" param="promo" value="true" searchParams={searchParams} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function FilterToggle({
  label, param, value, searchParams, onUpdate,
}: {
  label: string;
  param: string;
  value: string;
  searchParams: URLSearchParams;
  onUpdate: (u: Record<string, string | null>) => void;
}) {
  const active = searchParams.get(param) === value;
  return (
    <button
      onClick={() => onUpdate({ [param]: active ? null : value })}
      className={cn(
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
      )}
    >
      {label}
    </button>
  );
}
