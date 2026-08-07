"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header, HeaderSpacer } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HolographicAssistant } from "@/components/ai/HolographicAssistant";
import { BrandSplash } from "@/components/brand/BrandSplash";
import { PremiumBackground } from "@/components/brand/PremiumBackground";
import { Logo } from "@/components/layout/Logo";
import { MainNavProvider } from "@/components/layout/MainNavContext";

function isPublicMaintenanceUi(): boolean {
  const raw = (process.env.NEXT_PUBLIC_MAINTENANCE_MODE || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function MaintenanceBoutiquesChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PremiumBackground />
      <header className="border-b border-white/8 bg-[#0B1016]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Logo variant="official" size={40} />
          <p className="text-xs text-[#A7B0BC] sm:text-sm">
            Site en maintenance · Boutiques ouvertes
          </p>
          <Link
            href="/login"
            className="text-xs text-[#A7B0BC] transition-colors hover:text-brand-400"
          >
            Équipe
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/8 py-8 text-center text-xs text-[#A7B0BC]/70">
        All Vap&apos;s — Hautmont &amp; Le Quesnoy
      </footer>
    </>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const maintenancePage = pathname === "/maintenance";
  const isAdminApp = pathname === "/admin" || pathname.startsWith("/admin/");
  const inventaireEmployee =
    pathname === "/inventaire" ||
    pathname.startsWith("/inventaire/") ||
    pathname === "/acces" ||
    pathname.startsWith("/acces/");
  const boutiquesOnly =
    isPublicMaintenanceUi() &&
    (pathname === "/boutiques" || pathname.startsWith("/boutiques/"));

  if (maintenancePage || isAdminApp) {
    // Admin hors chrome boutique : forcer texte noir (body global = blanc inline)
    return (
      <div
        className="admin-light-surface min-h-dvh bg-gray-100 text-black"
        style={{ color: "#111827", WebkitTextFillColor: "#111827" }}
      >
        {children}
      </div>
    );
  }

  // Accès employé mobile : pas de chrome e-commerce / AVA
  if (inventaireEmployee) {
    return (
      <main className="min-h-dvh flex-1 bg-gradient-to-b from-emerald-50 via-white to-slate-50">
        {children}
      </main>
    );
  }

  if (boutiquesOnly) {
    return <MaintenanceBoutiquesChrome>{children}</MaintenanceBoutiquesChrome>;
  }

  return (
    <MainNavProvider>
      <BrandSplash />
      <PremiumBackground />
      <Suspense fallback={<HeaderSpacer />}>
        <Header />
      </Suspense>
      <HeaderSpacer />
      <main className="premium-main flex-1">{children}</main>
      <Footer />
      <HolographicAssistant />
    </MainNavProvider>
  );
}
