"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";
import { cn } from "@/lib/utils";

export function CategoryNav() {
  const searchParams = useSearchParams();
  const current = searchParams.get("category");

  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border border-white/8 bg-[#101720] p-3 sm:p-4">
      <div className="flex flex-nowrap gap-2 sm:flex-wrap">
        <Link
          href="/boutique"
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            !current
              ? "bg-brand-500 text-premium-black"
              : "bg-white/5 text-[#A7B0BC] hover:bg-white/8 hover:text-[#F5F7FA]"
          )}
        >
          Toutes
        </Link>
        {CATALOG_CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/boutique?category=${cat.slug}`}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              current === cat.slug
                ? "bg-brand-500 text-premium-black"
                : "bg-white/5 text-[#A7B0BC] hover:bg-white/8 hover:text-[#F5F7FA]"
            )}
          >
            {cat.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
