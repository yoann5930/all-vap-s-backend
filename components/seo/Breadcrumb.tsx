import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <>
      <JsonLd data={breadcrumbSchema(items)} />
      <nav aria-label="Fil d'Ariane" className="mb-6 overflow-x-auto text-sm text-gray-500 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol className="flex min-w-0 flex-nowrap items-center gap-1 sm:flex-wrap">
          {items.map((item, i) => (
            <li key={item.path} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
              {i === items.length - 1 ? (
                <span className="max-w-[12rem] truncate font-medium text-vap-black sm:max-w-none">
                  {item.name}
                </span>
              ) : (
                <Link href={item.path} className="hover:text-brand-700">
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
