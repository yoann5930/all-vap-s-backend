"use client";

const sortOptions = [
  { value: "newest", label: "Plus récents" },
  { value: "bestseller", label: "Meilleures ventes" },
  { value: "price-asc", label: "Prix croissant" },
  { value: "price-desc", label: "Prix décroissant" },
  { value: "name-asc", label: "Nom A-Z" },
];

interface ProductSortProps {
  value: string;
  onChange: (sort: string) => void;
}

export function ProductSort({ value, onChange }: ProductSortProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="hidden text-sm text-[#A7B0BC] sm:inline">
        Trier par :
      </label>
      <select
        id="sort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-xl border border-white/10 bg-[#0B1016] px-3 py-2 text-sm text-[#F5F7FA] focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#0B1016]">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
