"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  PackageCheck,
  Truck,
  Package,
  Warehouse,
  Users,
  FileText,
  Mail,
  Gift,
  Tag,
  Sparkles,
  Bot,
  BarChart3,
  Bell,
  Activity,
  Settings,
  Shield,
  X,
  RefreshCw,
  BookOpen,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Commandes", icon: ShoppingCart },
  { href: "/admin/preparation", label: "Préparation", icon: PackageCheck },
  { href: "/admin/expeditions", label: "Expéditions", icon: Truck },
  { href: "/admin/products", label: "Produits", icon: Package },
  { href: "/admin/stocks", label: "Stocks", icon: Warehouse },
  { href: "/admin/sumup-sync", label: "Sync SumUp", icon: RefreshCw },
  { href: "/admin/customers", label: "Clients", icon: Users },
  { href: "/admin/documents", label: "Documents", icon: FileText },
  { href: "/admin/emails", label: "Boîte mail A.V.A.", icon: Mail },
  { href: "/admin/ava-gestion", label: "A.V.A. Gestion", icon: Bot },
  { href: "/admin/ava-knowledge", label: "A.V.A. Métier P4", icon: BookOpen },
  { href: "/admin/rapports", label: "Rapports de gestion", icon: BarChart3 },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/fidelite", label: "Fidélité", icon: Gift },
  { href: "/admin/promotions", label: "Promotions", icon: Tag },
  { href: "/admin/transporteurs", label: "Transporteurs", icon: Truck },
  { href: "/admin/ai", label: "A.V.A. (stubs)", icon: Sparkles },
  { href: "/admin/activite", label: "Activité", icon: Activity },
  { href: "/admin/security", label: "Sécurité", icon: Shield },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
];

export function AdminSidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const close = onClose || (() => undefined);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={close}
        />
      )}
      <aside className="admin-sidebar flex flex-col" data-open={open}>
        <div className="flex h-[60px] items-center justify-between border-b border-white/[0.07] px-5">
          <Link href="/admin" className="flex flex-col" onClick={close}>
            <span
              className="text-[15px] font-medium tracking-wide text-[#f2f4f7]"
              style={{ fontFamily: "var(--adm-display)" }}
            >
              All Vap&apos;s
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#8b95a5]">
              Administration
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[#8b95a5] hover:bg-white/5 lg:hidden"
            onClick={close}
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Navigation admin">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className="admin-nav-link"
                data-active={active}
                onClick={close}
              >
                <item.icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.6} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.07] p-3">
          <p className="px-2 text-[10px] uppercase tracking-[0.14em] text-[#8b95a5]/70">
            Accès rapide
          </p>
          <div className="mt-2 space-y-0.5">
            <Link href="/admin/orders?filter=to_prepare" className="admin-nav-link" onClick={close}>
              À préparer
            </Link>
            <Link href="/admin/emails?filter=errors" className="admin-nav-link" onClick={close}>
              Erreurs e-mail
            </Link>
            <Link href="/admin/stocks?filter=low" className="admin-nav-link" onClick={close}>
              Stocks faibles
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
