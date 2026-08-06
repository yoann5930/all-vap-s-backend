"use client";

import type { Category, Brand } from "@prisma/client";
import { cn } from "@/lib/utils";

interface RangeOption {
  id: string;
  name: string;
  slug: string;
}

interface AdvancedFiltersProps {
  categories: Category[];
  brands: Brand[];
  ranges?: RangeOption[];
  searchParams: URLSearchParams;
  onUpdate: (updates: Record<string, string | null>) => void;
  className?: string;
}

const FORMAT = [
  { label: "10 ml", value: "10ml" },
  { label: "20 ml", value: "20ml" },
  { label: "30 ml", value: "30ml" },
  { label: "50 ml", value: "50ml" },
  { label: "70 ml", value: "70ml" },
  { label: "100 ml", value: "100ml" },
];

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

const FLAVOR_TAGS = [
  { label: "Fruit", key: "fruit" },
  { label: "Mentholé", key: "menthole" },
  { label: "Boisson", key: "boisson" },
  { label: "Dessert", key: "dessert" },
  { label: "Tabac", key: "tabac" },
  { label: "Bonbon", key: "bonbon" },
  { label: "Frais", key: "frais" },
  { label: "Très frais", key: "tres_frais" },
  { label: "Sucré", key: "sucre" },
  { label: "Acidulé", key: "acidule" },
] as const;

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/8 pt-4 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function AdvancedFilters({
  brands,
  ranges = [],
  searchParams,
  onUpdate,
  className,
}: AdvancedFiltersProps) {
  const currentBrand = searchParams.get("brand") || searchParams.get("fabricant");
  const currentGamme = searchParams.get("gamme") || searchParams.get("range");
  const currentFormat = searchParams.get("format");
  const currentNicotine = searchParams.get("nicotine");
  const currentPgvg = searchParams.get("pgvg");
  const currentDispo = searchParams.get("disponibilite") || (searchParams.get("inStock") === "true" ? "in_stock" : null);

  function resetAll() {
    onUpdate({
      nicotine: null,
      pgvg: null,
      format: null,
      brand: null,
      fabricant: null,
      gamme: null,
      range: null,
      saveur: null,
      category: null,
      search: null,
      disponibilite: null,
      inStock: null,
      fruit: null,
      menthole: null,
      boisson: null,
      dessert: null,
      tabac: null,
      bonbon: null,
      frais: null,
      tres_frais: null,
      sucre: null,
      acidule: null,
    });
  }

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-white/8 bg-[#101720] p-5",
        className
      )}
    >
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">Filtrer par</h3>

      {brands.length > 0 && (
        <FilterSection title="Fabricant">
          <ul className="max-h-36 space-y-1 overflow-y-auto">
            {brands.map((brand) => (
              <li key={brand.id}>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      brand: currentBrand === brand.slug ? null : brand.slug,
                      fabricant: currentBrand === brand.slug ? null : brand.slug,
                    })
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
        </FilterSection>
      )}

      {ranges.length > 0 && (
        <FilterSection title="Gamme">
          <ul className="space-y-1">
            {ranges.map((range) => (
              <li key={range.id}>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      gamme: currentGamme === range.slug ? null : range.slug,
                      range: currentGamme === range.slug ? null : range.slug,
                    })
                  }
                  className={cn(
                    "w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    currentGamme === range.slug
                      ? "bg-brand-500/15 text-brand-300"
                      : "text-[#A7B0BC] hover:bg-white/5 hover:text-white"
                  )}
                >
                  {range.name}
                </button>
              </li>
            ))}
          </ul>
        </FilterSection>
      )}

      <FilterSection title="Saveur">
        <input
          type="search"
          placeholder="Ex. Mangue, Cassis…"
          defaultValue={searchParams.get("saveur") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              onUpdate({ saveur: v || null });
            }
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0B1016] px-3 py-2 text-sm text-white placeholder:text-[#A7B0BC]/50"
        />
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {FLAVOR_TAGS.map(({ label, key }) => {
            const active = searchParams.get(key) === "true" || searchParams.get(key) === "1";
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onUpdate({ [key]: active ? null : "true" })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    active
                      ? "border-brand-500/40 bg-brand-500/15 text-brand-300"
                      : "border-white/10 text-[#A7B0BC] hover:border-white/20"
                  )}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <FilterSection title="Format">
        <ul className="space-y-2">
          {FORMAT.map((item) => {
            const active = currentFormat === item.value;
            return (
              <li key={item.value}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#D5DBE4]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onUpdate({ format: active ? null : item.value })}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#00AEEF]"
                  />
                  <span className={active ? "text-brand-300" : ""}>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <FilterSection title="Nicotine">
        <ul className="space-y-2">
          {NICOTINE.map((item) => {
            const active = currentNicotine === item.value;
            return (
              <li key={item.value}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#D5DBE4]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onUpdate({ nicotine: active ? null : item.value })}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#00AEEF]"
                  />
                  <span className={active ? "text-brand-300" : ""}>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <FilterSection title="PG/VG">
        <ul className="space-y-2">
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
      </FilterSection>

      <FilterSection title="Disponibilité">
        <ul className="space-y-2">
          {[
            { label: "En stock", value: "in_stock" },
            { label: "Rupture", value: "out_of_stock" },
          ].map((item) => {
            const active = currentDispo === item.value;
            return (
              <li key={item.value}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#D5DBE4]">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() =>
                      onUpdate({
                        disponibilite: active ? null : item.value,
                        inStock: active ? null : item.value === "in_stock" ? "true" : null,
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#00AEEF]"
                  />
                  <span className={active ? "text-brand-300" : ""}>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      <div className="border-t border-white/8 pt-4">
        <button type="button" onClick={resetAll} className="text-xs text-brand-400 hover:text-brand-300">
          Réinitialiser les filtres
        </button>
      </div>
    </div>
  );
}
