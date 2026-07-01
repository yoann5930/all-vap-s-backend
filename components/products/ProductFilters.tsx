"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProductFiltersProps {
  categories: string[];
  currentCategory?: string;
}

export function ProductFilters({ categories, currentCategory }: ProductFiltersProps) {
  const searchParams = useSearchParams();
  const search = searchParams.get("search");

  function buildUrl(category?: string) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    const qs = params.toString();
    return `/boutique${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold text-gray-900">Catégories</h2>
      <ul className="mt-3 space-y-1">
        <li>
          <Link
            href={buildUrl()}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm transition-colors",
              !currentCategory ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            Tous les produits
          </Link>
        </li>
        {categories.map((cat) => (
          <li key={cat}>
            <Link
              href={buildUrl(cat)}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm capitalize transition-colors",
                currentCategory === cat ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {cat}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
