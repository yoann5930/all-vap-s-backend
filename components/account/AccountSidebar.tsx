"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Package, MapPin, Heart, Gift, User, Sparkles } from "lucide-react";

const items = [
  { href: "/account", label: "Vue d'ensemble", icon: User },
  { href: "/account/commandes", label: "Mes commandes", icon: Package },
  { href: "/account/adresses", label: "Mes adresses", icon: MapPin },
  { href: "/compte/profil-vape", label: "Profil vape", icon: Sparkles },
  { href: "/favoris", label: "Mes favoris", icon: Heart },
  { href: "/account/fidelite", label: "Fidélité & QR Code", icon: Gift },
  { href: "/ia", label: "Assistant All Vap's", icon: Sparkles },
];

export function AccountSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 rounded-xl border border-wood-200/60 bg-white p-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === item.href ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-wood-50"
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
