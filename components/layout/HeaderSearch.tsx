"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderSearchProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function HeaderSearch({ mobile, onClose }: HeaderSearchProps) {
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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Rechercher un produit..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-vap-gray bg-vap-charcoal py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-vap-gray hover:text-white lg:hidden"
        aria-label="Rechercher"
      >
        <Search className="h-5 w-5" />
      </button>

      <form
        onSubmit={handleSubmit}
        className={cn(
          "hidden lg:block",
          open && "absolute inset-x-4 top-full z-50 mt-2 lg:relative lg:inset-auto lg:mt-0 lg:block"
        )}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-44 rounded-lg border border-vap-gray bg-vap-charcoal py-2 pl-9 pr-8 text-sm text-white placeholder:text-gray-500 transition-all focus:w-56 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 xl:w-52 xl:focus:w-64"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>
    </>
  );
}
