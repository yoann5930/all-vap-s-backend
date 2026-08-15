"use client";

import type { ManufacturerOption } from "@/lib/inventory/match-manufacturer";
import {
  isNonexistentBrandName,
  isRangeNotManufacturerName,
} from "@/lib/catalog/ranges-not-manufacturers";

type Props = {
  value: string;
  manufacturers: ManufacturerOption[];
  onChange: (name: string) => void;
  disabled?: boolean;
};

export function BrandManufacturerSelect({
  value,
  manufacturers,
  onChange,
  disabled,
}: Props) {
  const names = manufacturers.map((m) => m.name);
  const trimmed = value.trim();
  const blocked =
    isRangeNotManufacturerName(trimmed) || isNonexistentBrandName(trimmed);
  const extra =
    trimmed && !blocked && !names.some((n) => n === trimmed) ? trimmed : null;
  const selectValue = blocked ? "" : value;

  return (
    <label className="block">
      <span className="text-sm font-medium">Marque / fabricant</span>
      <select
        className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base"
        value={selectValue}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Choisir —</option>
        {extra ? (
          <option value={extra}>{extra} (suggéré — corriger si besoin)</option>
        ) : null}
        {manufacturers.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-gray-500">
        Fabricants du site — sélection uniquement, corrigeable
      </span>
    </label>
  );
}
