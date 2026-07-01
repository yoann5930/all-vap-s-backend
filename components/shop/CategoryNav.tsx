"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_GROUPS, CATALOG_CATEGORIES } from "@/lib/catalog/categories";
import { cn } from "@/lib/utils";

export function CategoryNav() {
  const searchParams = useSearchParams();
  const current = searchParams.get("category");

  return (
    <div className="mb-6 overflow-x-auto rounded-xl border border-wood-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/boutique"
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            !current ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          Toutes
        </Link>
        {CATALOG_CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/boutique?category=${cat.slug}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              current === cat.slug ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            {cat.name}
          </Link>
        ))}
      </div>
      <div className="mt-3 hidden gap-4 border-t pt-3 sm:flex">
        {CATEGORY_GROUPS.map((g) => (
          <span key={g.id} className="text-xs text-gray-500">
            <strong className="text-vap-black">{g.label}</strong>
            {" — "}
            {CATALOG_CATEGORIES.filter((c) => c.group === g.id).map((c) => c.name).join(", ")}
          </span>
        ))}
      </div>
    </div>
  );
}
