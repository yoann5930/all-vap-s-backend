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
  Phone,
  MapPin,
  Truck,
  Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart/CartProvider";
import { mainNavLinks } from "@/lib/navigation";
import { Logo } from "@/components/layout/Logo";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { stores } from "@/lib/stores";

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
  if (base === "/boutique") return pathname === "/boutique" || pathname.startsWith("/boutique/");
  return pathname === base || pathname.startsWith(base + "/");
}

function formatPhoneDisplay(e164: string) {
  const digits = e164.replace(/\D/g, "");
  // +33327496100 → 03 27 49 61 00
  if (digits.startsWith("33") && digits.length === 11) {
    const local = `0${digits.slice(2)}`;
    return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return e164;
}

export function Header() {
  const pathname = usePathname();
  const { cartCount } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const primaryStore = stores[0];

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
    window.location.href = "/";
  }

  const iconBtn =
    "rounded-xl p-2.5 text-white/55 transition-all duration-300 hover:bg-white/5 hover:text-brand-400 hover:shadow-[0_0_16px_rgba(0,174,239,0.14)]";

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Bandeau supérieur */}
      <div className="hidden border-b border-white/6 bg-[#0B1016] text-[11px] text-[#A7B0BC] sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-3 w-3 text-brand-500" strokeWidth={1.75} aria-hidden />
              Retrait boutique gratuit · Livraison Mondial Relay / Colissimo
            </span>
            <Link
              href="/boutiques"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-400"
            >
              <MapPin className="h-3 w-3 text-brand-500" strokeWidth={1.75} aria-hidden />
              Hautmont &amp; Le Quesnoy
            </Link>
          </div>
          {primaryStore?.phone && (
            <a
              href={`tel:${primaryStore.phone}`}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-400"
            >
              <Phone className="h-3 w-3 text-brand-500" strokeWidth={1.75} aria-hidden />
              {formatPhoneDisplay(primaryStore.phone)}
            </a>
          )}
        </div>
      </div>

      <div
        className={cn(
          "border-b transition-all duration-500",
          scrolled
            ? "premium-glass border-white/6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
            : "border-white/6 bg-premium-black/85 backdrop-blur-md"
        )}
      >
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8">
          <Logo variant="official" size={44} />

          <div className="hidden min-w-0 flex-1 md:block">
            <HeaderSearch expanded />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <div className="md:hidden">
              <HeaderSearch />
            </div>
            <Link
              href="/ia"
              className={cn(iconBtn, "hidden items-center gap-1.5 px-3 text-xs font-light sm:inline-flex")}
              aria-label="A.V.A. — bientôt disponible"
              title="A.V.A. — bientôt disponible"
            >
              <Sparkles className="h-4 w-4 text-brand-400" strokeWidth={1.5} />
              <span className="hidden lg:inline">
                A.V.A. <span className="text-white/35">bientôt</span>
              </span>
            </Link>
            <Link href="/favoris" className={cn(iconBtn, "hidden sm:flex")} aria-label="Favoris">
              <Heart className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} />
            </Link>
            {user ? (
              <div className="hidden items-center sm:flex">
                <Link href="/account" className={cn(iconBtn, "gap-1.5 px-3 text-sm")} aria-label="Compte">
                  <User className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} />
                  <span className="hidden max-w-[72px] truncate font-light lg:inline">
                    {user.firstName || "Compte"}
                  </span>
                </Link>
                <button type="button" onClick={handleLogout} className={iconBtn} title="Déconnexion">
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <Link href="/login" className={cn(iconBtn, "hidden sm:flex")} aria-label="Compte">
                <User className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} />
              </Link>
            )}
            <Link href="/cart" className={cn(iconBtn, "relative")} aria-label="Panier">
              <ShoppingCart className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-semibold text-premium-black shadow-[0_0_12px_rgba(0,174,239,0.55)]">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              className={cn(iconBtn, "lg:hidden")}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <nav
        className={cn(
          "hidden border-b transition-all duration-500 lg:block",
          scrolled ? "premium-glass border-white/4" : "border-white/4 bg-[#0B1016]/90 backdrop-blur-sm"
        )}
        aria-label="Navigation principale"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ul className="scrollbar-hide flex items-center gap-0.5 overflow-x-auto py-1">
            {mainNavLinks.map((link) => (
              <li key={`${link.href}-${link.label}`} className="shrink-0">
                <Link
                  href={link.href}
                  className={cn(
                    "premium-nav-link block px-3.5 py-2.5 text-[13px]",
                    isActiveLink(pathname, link.href) && "is-active"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {user?.role === "ADMIN" && (
              <li className="shrink-0">
                <Link href="/admin" className="premium-nav-link block px-3.5 py-2.5 text-[13px] text-brand-400/80">
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 top-[4.25rem] z-40 sm:top-[calc(4.25rem+1.75rem)] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden />
          <nav
            className="premium-glass animate-slide-down relative max-h-[calc(100vh-4.25rem)] overflow-y-auto px-4 py-5 shadow-2xl"
            aria-label="Menu mobile"
          >
            <div className="mb-5 md:hidden">
              <HeaderSearch mobile onClose={() => setMobileOpen(false)} />
            </div>
            <ul className="space-y-1">
              {mainNavLinks.map((link) => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-light transition-colors",
                      isActiveLink(pathname, link.href)
                        ? "bg-brand-500/10 text-brand-400"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                    <ChevronDown className="-rotate-90 h-4 w-4 text-white/25" />
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/ia"
                  className="flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-light text-brand-400/90 hover:bg-brand-500/10"
                  onClick={() => setMobileOpen(false)}
                >
                  A.V.A. — bientôt disponible
                  <Sparkles className="h-4 w-4" />
                </Link>
              </li>
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/6 pt-5">
              <Link
                href="/favoris"
                className="premium-glass-light flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-light text-white/70"
                onClick={() => setMobileOpen(false)}
              >
                <Heart className="h-4 w-4" /> Favoris
              </Link>
              <Link
                href={user ? "/account" : "/login"}
                className="premium-glass-light flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-light text-white/70"
                onClick={() => setMobileOpen(false)}
              >
                <User className="h-4 w-4" /> Compte
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export function HeaderSpacer() {
  return <div className="h-[4.25rem] sm:h-[calc(4.25rem+1.75rem)] lg:h-[calc(7.25rem+1.75rem)]" aria-hidden="true" />;
}
