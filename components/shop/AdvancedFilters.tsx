"use client";

import type { Category, Brand } from "@prisma/client";
import { CATEGORY_GROUPS, CATALOG_CATEGORIES } from "@/lib/catalog/categories";
import { cn } from "@/lib/utils";

interface AdvancedFiltersProps {
  categories: Category[];
  brands: Brand[];
  searchParams: URLSearchParams;
  onUpdate: (updates: Record<string, string | null>) => void;
  className?: string;
}

const filterBtn =
  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors";
const filterBtnActive = "bg-brand-500/15 font-medium text-brand-400";
const filterBtnIdle = "text-[#A7B0BC] hover:bg-white/5 hover:text-[#F5F7FA]";

export function AdvancedFilters({
  categories,
  brands,
  searchParams,
  onUpdate,
  className,
}: AdvancedFiltersProps) {
  const currentCategory = searchParams.get("category");
  const currentBrand = searchParams.get("brand");
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";

  const categoryList =
    categories.length > 0
      ? categories.map((c) => ({ name: c.name, slug: c.slug }))
      : CATALOG_CATEGORIES.map((c) => ({ name: c.name, slug: c.slug }));

  return (
    <div
      className={cn(
        "space-y-6 rounded-2xl border border-white/8 bg-[#101720] p-5",
        className
      )}
    >
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F5F7FA]">
          Catégories
        </h3>
        <button
          type="button"
          onClick={() => onUpdate({ category: null })}
          className={cn(filterBtn, "mt-3", !currentCategory ? filterBtnActive : filterBtnIdle)}
        >
          Toutes
        </button>
        {CATEGORY_GROUPS.map((group) => {
          const groupCats = categoryList.filter(
            (c) => CATALOG_CATEGORIES.find((cc) => cc.slug === c.slug)?.group === group.id
          );
          if (groupCats.length === 0) return null;
          return (
            <div key={group.id} className="mt-4">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]/60">
                {group.label}
              </p>
              <ul className="mt-1 space-y-0.5">
                {groupCats.map((cat) => (
                  <li key={cat.slug}>
                    <button
                      type="button"
                      onClick={() => onUpdate({ category: cat.slug })}
                      className={cn(
                        filterBtn,
                        currentCategory === cat.slug ? filterBtnActive : filterBtnIdle
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
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F5F7FA]">
            Marques
          </h3>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
            {brands.map((brand) => (
              <li key={brand.id}>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({ brand: currentBrand === brand.slug ? null : brand.slug })
                  }
                  className={cn(
                    filterBtn,
                    currentBrand === brand.slug ? filterBtnActive : filterBtnIdle
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
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F5F7FA]">
          Prix (€)
        </h3>
        <div className="mt-3 flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={minPrice ? String(parseInt(minPrice) / 100) : ""}
            onChange={(e) =>
              onUpdate({
                minPrice: e.target.value ? String(parseInt(e.target.value) * 100) : null,
              })
            }
            className="w-full rounded-lg border border-white/10 bg-[#0B1016] px-3 py-2 text-sm text-[#F5F7FA] placeholder:text-[#A7B0BC]/50 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
          <input
            type="number"
            placeholder="Max"
            value={maxPrice ? String(parseInt(maxPrice) / 100) : ""}
            onChange={(e) =>
              onUpdate({
                maxPrice: e.target.value ? String(parseInt(e.target.value) * 100) : null,
              })
            }
            className="w-full rounded-lg border border-white/10 bg-[#0B1016] px-3 py-2 text-sm text-[#F5F7FA] placeholder:text-[#A7B0BC]/50 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </div>
      </div>

      <div className="space-y-1 border-t border-white/8 pt-4">
        <FilterToggle
          label="En stock uniquement"
          param="inStock"
          value="true"
          searchParams={searchParams}
          onUpdate={onUpdate}
        />
        <FilterToggle
          label="Nouveautés"
          param="new"
          value="true"
          searchParams={searchParams}
          onUpdate={onUpdate}
        />
        <FilterToggle
          label="Meilleures ventes"
          param="bestseller"
          value="true"
          searchParams={searchParams}
          onUpdate={onUpdate}
        />
        <FilterToggle
          label="Promotions"
          param="promo"
          value="true"
          searchParams={searchParams}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

function FilterToggle({
  label,
  param,
  value,
  searchParams,
  onUpdate,
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
      type="button"
      onClick={() => onUpdate({ [param]: active ? null : value })}
      className={cn(filterBtn, active ? filterBtnActive : filterBtnIdle)}
    >
      {label}
    </button>
  );
}
