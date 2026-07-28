"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderSearchProps {
  mobile?: boolean;
  expanded?: boolean;
  onClose?: () => void;
}

export function HeaderSearch({ mobile, expanded, onClose }: HeaderSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/boutique?search=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/boutique");
    }
    setOpen(false);
    onClose?.();
  }

  if (mobile) {
    return (
      <form onSubmit={handleSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A7B0BC]" />
        <input
          type="search"
          placeholder="Rechercher un produit, une marque…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0B1016] py-3 pl-11 pr-4 text-sm text-[#F5F7FA] placeholder:text-[#A7B0BC]/70 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        />
      </form>
    );
  }

  if (expanded) {
    return (
      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A7B0BC]" />
          <input
            type="search"
            placeholder="Rechercher un produit, une marque…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#0B1016] py-2.5 pl-11 pr-10 text-sm text-[#F5F7FA] placeholder:text-[#A7B0BC]/65 transition-colors focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            aria-label="Rechercher"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A7B0BC] hover:text-white"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-xl p-2.5 text-white/55 transition-colors hover:bg-white/5 hover:text-brand-400 lg:hidden"
        aria-label="Rechercher"
      >
        <Search className="h-5 w-5" />
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute inset-x-4 top-full z-50 mt-2 md:hidden"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A7B0BC]" />
            <input
              type="search"
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className={cn(
                "w-full rounded-xl border border-white/10 bg-[#0B1016] py-3 pl-11 pr-10 text-sm text-[#F5F7FA]",
                "placeholder:text-[#A7B0BC]/70 focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
              )}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A7B0BC] hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      )}
    </>
  );
}
