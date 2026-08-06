"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Package,
  MapPin,
  Heart,
  Gift,
  User,
  Sparkles,
  Headphones,
} from "lucide-react";

const items = [
  { href: "/account", label: "Vue d'ensemble", icon: User },
  { href: "/account/commandes", label: "Commandes", icon: Package },
  { href: "/favoris", label: "Favoris", icon: Heart },
  { href: "/account/adresses", label: "Adresses", icon: MapPin },
  { href: "/account/fidelite", label: "Points fidélité", icon: Gift },
  { href: "/compte/profil-vape", label: "Profil vape", icon: Sparkles },
  { href: "/contact", label: "Support", icon: Headphones },
];

export function AccountSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Espace client"
      className="space-y-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-light tracking-wide transition-colors duration-280",
              active
                ? "bg-[rgba(61,126,255,0.12)] text-[#B8CDFF]"
                : "text-[#8A8A8E] hover:bg-white/[0.04] hover:text-white"
            )}
          >
            <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
