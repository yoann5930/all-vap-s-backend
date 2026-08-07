"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Tag,
  Image,
  Ticket,
  Star,
  FolderTree,
  Sparkles,
  Upload,
  Warehouse,
  RefreshCw,
  ClipboardList,
  Cloud,
  Smartphone,
  Bot,
  X,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/ava", label: "A.V.A.", icon: Bot },
  { href: "/admin/fidelatoo", label: "Fidelatoo VM", icon: Smartphone },
  { href: "/admin/products", label: "Produits", icon: Package },
  { href: "/admin/stocks", label: "Stocks", icon: Warehouse },
  { href: "/admin/inventaires", label: "Inventaires", icon: ClipboardList },
  { href: "/admin/inventaire", label: "Saisie inventaire", icon: ClipboardList },
  { href: "/admin/google", label: "Google Sync", icon: Cloud },
  { href: "/admin/import", label: "Import CSV", icon: Upload },
  { href: "/admin/sumup-import", label: "Import SumUp", icon: RefreshCw },
  { href: "/admin/orders", label: "Commandes", icon: ShoppingCart },
  { href: "/admin/customers", label: "Clients", icon: Users },
  { href: "/admin/catalog", label: "Catégories & Marques", icon: FolderTree },
  { href: "/admin/promotions", label: "Promotions", icon: Tag },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/banners", label: "Bannières", icon: Image },
  { href: "/admin/reviews", label: "Avis", icon: Star },
  { href: "/admin/ai", label: "IA (config)", icon: Sparkles },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/ava") {
    return pathname === "/admin/ava" || pathname.startsWith("/admin/ava/");
  }
  return pathname === href || pathname.startsWith(href + "/");
}

type Props = {
  /** Mode AdminShell (tiroir mobile) */
  open?: boolean;
  onClose?: () => void;
};

export function AdminSidebar({ open = false, onClose }: Props) {
  const pathname = usePathname();
  const shellMode = typeof onClose === "function";

  const links = navItems.map((item) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => onClose?.()}
        className={cn(
          shellMode
            ? "admin-nav-link"
            : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          !shellMode &&
            (active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50")
        )}
        {...(shellMode ? { "data-active": active ? "true" : "false" } : {})}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        {item.label}
      </Link>
    );
  });

  // Layout admin classique : menu toujours visible (PC + mobile)
  if (!shellMode) {
    return (
      <aside className="w-full lg:w-56 lg:flex-shrink-0">
        <nav className="space-y-1 rounded-xl border border-gray-200 bg-white p-3" aria-label="Menu administration">
          {links}
        </nav>
      </aside>
    );
  }

  // AdminShell : sidebar desktop + tiroir mobile
  return (
    <>
      <aside className="admin-sidebar hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[var(--adm-sidebar-w)] lg:flex-shrink-0 lg:flex-col lg:overflow-y-auto">
        <div className="border-b border-white/5 px-4 py-4">
          <p className="text-sm font-medium text-[#f2f4f7]">All Vap&apos;s</p>
          <p className="text-xs text-[#8b95a5]">Back-office</p>
        </div>
        <nav className="flex flex-col gap-1 p-3" aria-label="Menu administration">
          {links}
        </nav>
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity",
            open ? "opacity-100" : "opacity-0"
          )}
          aria-label="Fermer le menu"
          onClick={() => onClose?.()}
        />
        <aside
          className={cn(
            "admin-sidebar absolute left-0 top-0 flex h-full w-[min(100%,280px)] flex-col overflow-y-auto shadow-2xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-sm font-medium text-[#f2f4f7]">Menu admin</p>
            <button
              type="button"
              className="rounded-lg p-2 text-[#8b95a5] hover:bg-white/5"
              aria-label="Fermer"
              onClick={() => onClose?.()}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 p-3">{links}</nav>
        </aside>
      </div>
    </>
  );
}
