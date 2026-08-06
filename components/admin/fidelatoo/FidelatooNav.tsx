"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin/fidelatoo", label: "Vue d'ensemble" },
  { href: "/admin/fidelatoo/ava", label: "A.V.A." },
  { href: "/admin/fidelatoo/virtual-machine", label: "Machine virtuelle" },
  { href: "/admin/fidelatoo/collaborators", label: "Collaborateurs" },
  { href: "/admin/fidelatoo/qr-code", label: "QR code" },
  { href: "/admin/fidelatoo/activity", label: "Activité" },
  { href: "/admin/fidelatoo/security", label: "Sécurité" },
  { href: "/admin/fidelatoo/settings", label: "Réglages" },
];

export function FidelatooNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/admin/fidelatoo" && pathname.startsWith(link.href + "/"));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
