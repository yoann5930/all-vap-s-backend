"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
import {
  PRODUCT_THUMB_IMAGE_QUALITY,
  isPreoptimizedProductMedia,
} from "@/lib/catalog/product-image-display";

interface SearchResult {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  promoPriceCents?: number | null;
  isPromo?: boolean;
  imageUrl?: string | null;
  category: string;
  href?: string;
  suggestedNic?: string | null;
}

type SearchUiState = "IDLE" | "LOADING" | "RESULTS" | "NO_RESULT" | "ERROR";

export function InstantSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [uiState, setUiState] = useState<SearchUiState>("IDLE");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setUiState("IDLE");
      return;
    }

    setUiState("LOADING");
    setOpen(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
          setResults([]);
          setUiState("ERROR");
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setResults(list);
        setUiState(list.length > 0 ? "RESULTS" : "NO_RESULT");
        setOpen(true);
      } catch {
        setResults([]);
        setUiState("ERROR");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative mx-auto max-w-2xl">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#A7B0BC]" />
      <input
        type="search"
        placeholder="Recherche instantanée (produit, marque, saveur…)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)}
        className="w-full rounded-xl border border-white/10 bg-[#0B1016] py-3.5 pl-12 pr-4 text-sm text-[#F5F7FA] placeholder:text-[#A7B0BC]/65 shadow-[0_0_0_1px_rgba(0,174,239,0.04)] focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        aria-label="Recherche produits"
      />
      {open && uiState === "LOADING" && (
        <div
          className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#101720] px-4 py-3 text-sm text-[#A7B0BC] shadow-2xl"
          role="status"
        >
          Recherche en cours…
        </div>
      )}
      {open && uiState === "NO_RESULT" && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#101720] px-4 py-3 text-sm text-[#A7B0BC] shadow-2xl">
          Aucun résultat pour « {query} ».
        </div>
      )}
      {open && uiState === "ERROR" && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-red-500/30 bg-[#101720] px-4 py-3 text-sm text-red-300 shadow-2xl">
          Recherche indisponible pour le moment.
        </div>
      )}
      {open && uiState === "RESULTS" && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#101720] shadow-2xl">
          {results.map((p) => {
            const nicMatch = query.match(/(\d+)\s*mg/i);
            const href =
              p.href ||
              (nicMatch
                ? `/boutique/${p.slug}?nic=${nicMatch[1]}`
                : `/boutique/${p.slug}`);
            return (
            <Link
              key={p.id}
              href={href}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
            >
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[#0B1016]">
                {p.imageUrl &&
                  (isPreoptimizedProductMedia(p.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain p-0.5"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Image
                      src={p.imageUrl}
                      alt=""
                      fill
                      className="object-contain p-0.5"
                      sizes="40px"
                      quality={PRODUCT_THUMB_IMAGE_QUALITY}
                    />
                  ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#F5F7FA]">{p.name}</p>
                <p className="text-xs capitalize text-[#A7B0BC]">{p.category}</p>
              </div>
              <span className="text-sm font-semibold text-brand-400">
                {formatPrice(getEffectivePrice(p))}
              </span>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
