"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ProductPaginationProps {
  pagination: { page: number; totalPages: number; total: number };
  onPageChange: (page: number) => void;
}

export function ProductPagination({ pagination, onPageChange }: ProductPaginationProps) {
  const { page, totalPages } = pagination;

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Page précédente"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        let pageNum: number;
        if (totalPages <= 5) pageNum = i + 1;
        else if (page <= 3) pageNum = i + 1;
        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
        else pageNum = page - 2 + i;

        return (
          <button
            key={pageNum}
            type="button"
            onClick={() => onPageChange(pageNum)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-medium transition-colors ${
              pageNum === page
                ? "bg-brand-500 text-premium-black"
                : "text-[#A7B0BC] hover:bg-white/5 hover:text-[#F5F7FA]"
            }`}
            aria-current={pageNum === page ? "page" : undefined}
          >
            {pageNum}
          </button>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Page suivante"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
