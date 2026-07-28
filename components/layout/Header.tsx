"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  User,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Phone,
  Truck,
  Sparkles,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { cn, formatPrice } from "@/lib/utils";
import { useCart } from "@/components/cart/CartProvider";
import { getCartTotal } from "@/lib/cart";
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

function isActiveLink(pathname: string, href: string, search = "") {
  if (href === "/") return pathname === "/";
  const base = href.split("?")[0];
  const hrefQuery = href.includes("?") ? href.split("?")[1] : "";
  if (base === "/e-liquides" || hrefQuery.includes("category=e-liquides")) {
    return (
      pathname === "/" ||
      pathname.includes("e-liquides") ||
      search.includes("category=e-liquides") ||
      (pathname === "/boutique" && !search.includes("category="))
    );
  }
  if (base === "/boutique" && !hrefQuery) {
    return pathname === "/boutique" || pathname.startsWith("/boutique/");
  }
  return pathname === base || pathname.startsWith(base + "/");
}

function formatPhoneDisplay(e164: string) {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length === 11) {
    const local = `0${digits.slice(2)}`;
    return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return e164;
}

export function Header() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { cartCount, items } = useCart();
  const cartTotal = useMemo(() => getCartTotal(items), [items]);
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

  function openAva() {
    window.dispatchEvent(new Event("allvaps:open-ava"));
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Top bar maquette */}
      <div className="hidden border-b border-white/6 bg-[#070A0F] text-[11px] text-[#A7B0BC] sm:block">
        <div className="mx-auto grid max-w-[1400px] grid-cols-3 items-center gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-1.5 justify-self-start">
            <Truck className="h-3 w-3 text-amber-400" strokeWidth={1.75} aria-hidden />
            <span>Livraison offerte dès 49€ d&apos;achat</span>
          </div>
          <p className="justify-self-center text-center text-[11px] text-[#A7B0BC]/90">
            All Vap&apos;s Le Quesnoy &amp; Hautmont – Bar à vape – Conseils d&apos;experts
          </p>
          {primaryStore?.phone ? (
            <a
              href={`tel:${primaryStore.phone}`}
              className="inline-flex items-center gap-1.5 justify-self-end transition-colors hover:text-brand-400"
            >
              <Phone className="h-3 w-3 text-brand-500" strokeWidth={1.75} aria-hidden />
              Besoin d&apos;aide ? {formatPhoneDisplay(primaryStore.phone)}
            </a>
          ) : (
            <span className="justify-self-end" />
          )}
        </div>
      </div>

      {/* Main bar */}
      <div
        className={cn(
          "border-b transition-all duration-500",
          scrolled
            ? "border-white/6 bg-[#05070A]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
            : "border-white/6 bg-[#05070A]/90 backdrop-blur-md"
        )}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:gap-8 lg:px-8">
          <Logo />

          <div className="hidden min-w-0 flex-1 md:block">
            <HeaderSearch expanded />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="md:hidden">
              <HeaderSearch />
            </div>

            {user ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Link
                  href="/account"
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                >
                  <User className="h-5 w-5 text-white/70" strokeWidth={1.5} />
                  <span className="hidden leading-tight lg:block">
                    <span className="block text-xs font-medium text-white">Mon compte</span>
                    <span className="block text-[10px] text-[#A7B0BC]">
                      {user.firstName || "Connecté"}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl p-2 text-white/45 hover:bg-white/5 hover:text-brand-400"
                  title="Déconnexion"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5 sm:flex"
              >
                <User className="h-5 w-5 text-white/70" strokeWidth={1.5} />
                <span className="hidden leading-tight lg:block">
                  <span className="block text-xs font-medium text-white">Mon compte</span>
                  <span className="block text-[10px] text-[#A7B0BC]">Se connecter</span>
                </span>
              </Link>
            )}

            <Link
              href="/cart"
              className="relative flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5"
              aria-label="Panier"
            >
              <span className="relative">
                <ShoppingCart className="h-5 w-5 text-white/80" strokeWidth={1.5} />
                <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-premium-black">
                  {cartCount}
                </span>
              </span>
              <span className="hidden leading-tight lg:block">
                <span className="block text-xs font-medium text-white">Panier</span>
                <span className="block text-[10px] text-[#A7B0BC]">
                  {formatPrice(cartTotal)}
                </span>
              </span>
            </Link>

            <button
              type="button"
              className="rounded-xl p-2.5 text-white/70 hover:bg-white/5 lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Nav + AVA */}
      <nav
        className={cn(
          "hidden border-b transition-all duration-500 lg:block",
          scrolled ? "border-white/4 bg-[#05070A]/95 backdrop-blur-xl" : "border-white/4 bg-[#070A0F]/95"
        )}
        aria-label="Navigation principale"
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <ul className="scrollbar-hide flex items-center gap-0.5 overflow-x-auto py-1">
            {mainNavLinks.map((link) => (
              <li key={`${link.href}-${link.label}`} className="shrink-0">
                <Link
                  href={link.href}
                  className={cn(
                    "block px-3 py-2.5 text-[12px] font-semibold tracking-[0.06em] transition-colors",
                    isActiveLink(pathname, link.href, search)
                      ? "border-b-2 border-brand-500 text-brand-400"
                      : "border-b-2 border-transparent text-[#A7B0BC] hover:text-white"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {user?.role === "ADMIN" && (
              <li className="shrink-0">
                <Link
                  href="/admin"
                  className="block px-3 py-2.5 text-[12px] font-semibold tracking-[0.06em] text-brand-400/80"
                >
                  ADMIN
                </Link>
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={openAva}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-brand-500/50 bg-transparent px-4 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            A.V.A. – Votre assistant
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 top-[4.5rem] z-40 sm:top-[calc(4.5rem+1.75rem)] lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <nav
            className="relative max-h-[calc(100vh-4.5rem)] overflow-y-auto border-b border-white/8 bg-[#0B1016] px-4 py-5 shadow-2xl"
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
                      "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium transition-colors",
                      isActiveLink(pathname, link.href, search)
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
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium text-brand-400 hover:bg-brand-500/10"
                  onClick={() => {
                    setMobileOpen(false);
                    openAva();
                  }}
                >
                  A.V.A. – Votre assistant
                  <Sparkles className="h-4 w-4" />
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}

export function HeaderSpacer() {
  return (
    <div
      className="h-[4.5rem] sm:h-[calc(4.5rem+1.75rem)] lg:h-[calc(7.35rem+1.75rem)]"
      aria-hidden="true"
    />
  );
}
