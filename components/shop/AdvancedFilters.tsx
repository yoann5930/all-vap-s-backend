"use client";

import type { Category, Brand } from "@prisma/client";
import { cn } from "@/lib/utils";

interface AdvancedFiltersProps {
  categories: Category[];
  brands: Brand[];
  searchParams: URLSearchParams;
  onUpdate: (updates: Record<string, string | null>) => void;
  className?: string;
}

const NICOTINE = [
  { label: "0 mg/ml", value: "0" },
  { label: "3 mg/ml", value: "3" },
  { label: "6 mg/ml", value: "6" },
  { label: "12 mg/ml", value: "12" },
  { label: "18 mg/ml", value: "18" },
];

const PGVG = [
  { label: "50/50", value: "50/50" },
  { label: "30/70", value: "30/70" },
  { label: "70/30", value: "70/30" },
  { label: "100% VG", value: "100vg" },
];

export function AdvancedFilters({
  brands,
  searchParams,
  onUpdate,
  className,
}: AdvancedFiltersProps) {
  const currentBrand = searchParams.get("brand");
  const currentNicotine = searchParams.get("nicotine");
  const currentPgvg = searchParams.get("pgvg");

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-white/8 bg-[#101720] p-5",
        className
      )}
    >
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">
        Filtrer par
      </h3>

      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]"
        >
          Taux de nicotine
          <span className="text-[#A7B0BC]/50">▾</span>
        </button>
        <ul className="mt-3 space-y-2">
          {NICOTINE.map((item) => {
            const active = currentNicotine === item.value;
            return (
              <li key={item.value}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#D5DBE4]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() =>
                      onUpdate({ nicotine: active ? null : item.value })
                    }
                    className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#00AEEF]"
                  />
                  <span className={active ? "text-brand-300" : ""}>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-white/8 pt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]"
        >
          Ratio PG/VG
          <span className="text-[#A7B0BC]/50">▾</span>
        </button>
        <ul className="mt-3 space-y-2">
          {PGVG.map((item) => {
            const active = currentPgvg === item.value;
            return (
              <li key={item.value}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#D5DBE4]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onUpdate({ pgvg: active ? null : item.value })}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#00AEEF]"
                  />
                  <span className={active ? "text-brand-300" : ""}>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {brands.length > 0 && (
        <div className="border-t border-white/8 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]">
            Marques
          </p>
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
            {brands.map((brand) => (
              <li key={brand.id}>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({ brand: currentBrand === brand.slug ? null : brand.slug })
                  }
                  className={cn(
                    "w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    currentBrand === brand.slug
                      ? "bg-brand-500/15 text-brand-300"
                      : "text-[#A7B0BC] hover:bg-white/5 hover:text-white"
                  )}
                >
                  {brand.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-white/8 pt-4">
        <button
          type="button"
          onClick={() =>
            onUpdate({
              nicotine: null,
              pgvg: null,
              brand: null,
              category: null,
              search: null,
            })
          }
          className="text-xs text-brand-400 hover:text-brand-300"
        >
          Réinitialiser les filtres
        </button>
      </div>
    </div>
  );
}
