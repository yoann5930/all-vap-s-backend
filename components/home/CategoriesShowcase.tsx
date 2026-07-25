"use client";

import Link from "next/link";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";

const DISPLAY = [
  "cigarettes-electroniques",
  "pods",
  "box",
  "mods",
  "clearomiseurs",
  "resistances",
  "e-liquides",
  "diy",
  "aromes",
  "boosters",
  "accessoires",
  "batteries",
  "chargeurs",
  "verres",
  "drip-tips",
];

export function CategoriesShowcase() {
  const cats = DISPLAY.map((slug) => CATALOG_CATEGORIES.find((c) => c.slug === slug)).filter(
    Boolean
  ) as typeof CATALOG_CATEGORIES;

  return (
    <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="mb-12 max-w-xl">
        <p className="premium-section-label">Univers</p>
        <h2 className="premium-section-title mt-3">Catégories</h2>
        <p className="premium-section-subtitle">Une sélection claire, du matériel aux liquides.</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cats.map((cat) => (
          <li key={cat.slug}>
            <Link
              href={`/boutique?category=${cat.slug}`}
              className="group flex h-full flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 transition-all duration-300 hover:border-[rgba(61,126,255,0.28)] hover:bg-white/[0.04]"
            >
              <span className="font-display text-sm font-light tracking-wide text-white/90 group-hover:text-white">
                {cat.name}
              </span>
              <span className="mt-3 text-[10px] font-light tracking-[0.18em] text-[#8A8A8E] uppercase transition-colors group-hover:text-[rgba(61,126,255,0.85)]">
                Explorer
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/boutique?sort=new"
            className="group flex h-full flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 transition-all duration-300 hover:border-[rgba(61,126,255,0.28)] hover:bg-white/[0.04]"
          >
            <span className="font-display text-sm font-light tracking-wide text-white/90">Nouveautés</span>
            <span className="mt-3 text-[10px] font-light tracking-[0.18em] text-[#8A8A8E] uppercase">Explorer</span>
          </Link>
        </li>
        <li>
          <Link
            href="/boutique?promo=1"
            className="group flex h-full flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 transition-all duration-300 hover:border-[rgba(61,126,255,0.28)] hover:bg-white/[0.04]"
          >
            <span className="font-display text-sm font-light tracking-wide text-white/90">Promotions</span>
            <span className="mt-3 text-[10px] font-light tracking-[0.18em] text-[#8A8A8E] uppercase">Explorer</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
