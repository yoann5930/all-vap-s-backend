"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  User,
  Menu,
  X,
  LogOut,
  Heart,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart/CartProvider";
import { mainNavLinks } from "@/lib/navigation";
import { Logo } from "@/components/layout/Logo";
import { HeaderSearch } from "@/components/layout/HeaderSearch";

interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

function isActiveLink(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}

export function Header() {
  const pathname = usePathname();
  const { cartCount } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
    window.location.href = "/";
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Top accent bar */}
      <div className="hidden bg-wood-300 sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-1.5 text-xs font-medium text-vap-charcoal">
          <span>Livraison rapide</span>
          <span className="mx-3 text-wood-500">|</span>
          <span>Paiement sécurisé Viva.com</span>
          <span className="mx-3 text-wood-500">|</span>
          <span>Vente réservée aux +18 ans</span>
        </div>
      </div>

      {/* Main bar */}
      <div className="border-b border-vap-gray/50 bg-vap-black/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo variant="light" />

          <div className="flex items-center gap-1 sm:gap-2">
            <HeaderSearch />

            <Link
              href="/favoris"
              className="hidden rounded-lg p-2 text-gray-300 transition-colors hover:bg-vap-gray hover:text-white sm:block"
              aria-label="Favoris"
            >
              <Heart className="h-5 w-5" />
            </Link>

            {user ? (
              <div className="hidden items-center sm:flex">
                <Link
                  href="/account"
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-gray-300 transition-colors hover:bg-vap-gray hover:text-white"
                  aria-label="Compte client"
                >
                  <User className="h-5 w-5" />
                  <span className="hidden max-w-[80px] truncate lg:inline">
                    {user.firstName || "Compte"}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-vap-gray hover:text-white"
                  title="Déconnexion"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden rounded-lg p-2 text-gray-300 transition-colors hover:bg-vap-gray hover:text-white sm:block"
                aria-label="Compte client"
              >
                <User className="h-5 w-5" />
              </Link>
            )}

            <Link
              href="/cart"
              className="relative rounded-lg p-2 text-gray-300 transition-colors hover:bg-vap-gray hover:text-white"
              aria-label="Panier"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-vap-gray hover:text-white lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Category navigation — desktop */}
      <nav
        className="hidden border-b border-vap-gray/30 bg-vap-charcoal/95 backdrop-blur-md lg:block"
        aria-label="Navigation principale"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ul className="scrollbar-hide flex items-center gap-1 overflow-x-auto py-0">
            {mainNavLinks.map((link) => (
              <li key={link.href} className="flex-shrink-0">
                <Link
                  href={link.href}
                  className={cn(
                    "block whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors",
                    isActiveLink(pathname, link.href)
                      ? "border-b-2 border-brand-500 text-brand-400"
                      : "text-gray-300 hover:text-white"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {user?.role === "ADMIN" && (
              <li className="flex-shrink-0">
                <Link
                  href="/admin"
                  className="block whitespace-nowrap px-3 py-3 text-sm font-medium text-brand-400 hover:text-brand-300"
                >
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 top-[calc(4rem+0px)] z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <nav
            className="animate-slide-down relative max-h-[calc(100vh-4rem)] overflow-y-auto bg-vap-charcoal px-4 py-4 shadow-2xl"
            aria-label="Menu mobile"
          >
            <div className="mb-4">
              <HeaderSearch mobile onClose={() => setMobileOpen(false)} />
            </div>

            <ul className="space-y-1">
              {mainNavLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      isActiveLink(pathname, link.href)
                        ? "bg-brand-600/20 text-brand-400"
                        : "text-gray-200 hover:bg-vap-gray"
                    )}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                    <ChevronDown className="-rotate-90 h-4 w-4 text-gray-500" />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-vap-gray pt-4">
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/favoris"
                  className="flex items-center justify-center gap-2 rounded-lg bg-vap-gray px-3 py-3 text-sm text-gray-200"
                  onClick={() => setMobileOpen(false)}
                >
                  <Heart className="h-4 w-4" /> Favoris
                </Link>
                <Link
                  href={user ? "/account" : "/login"}
                  className="flex items-center justify-center gap-2 rounded-lg bg-vap-gray px-3 py-3 text-sm text-gray-200"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" /> Compte
                </Link>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export function HeaderSpacer() {
  return <div className="h-16 sm:h-[5.75rem] lg:h-[8.75rem]" aria-hidden="true" />;
}
