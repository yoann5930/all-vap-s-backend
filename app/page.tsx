import Link from "next/link";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoriesShowcase } from "@/components/home/CategoriesShowcase";
import { BrandsSection } from "@/components/home/BrandsSection";
import { ReviewsSection } from "@/components/home/ReviewsSection";
import { ServicesSection } from "@/components/home/ServicesSection";
import { StoresSection } from "@/components/home/StoresSection";
import { ProductGrid } from "@/components/products/ProductGrid";
import prisma from "@/lib/prisma";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, absoluteUrl } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/"),
  },
};

async function getFeaturedProducts() {
  try {
    return await prisma.product.findMany({
      where: { isActive: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return [];
  }
}

async function getPromoProducts() {
  try {
    return await prisma.product.findMany({
      where: { isActive: true, OR: [{ isPromo: true }, { promoPriceCents: { not: null } }] },
      take: 8,
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [products, promos] = await Promise.all([getFeaturedProducts(), getPromoProducts()]);

  return (
    <>
      <HeroSection />

      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="premium-section-label">Sélection</p>
            <h2 className="premium-section-title mt-3">Nouveautés</h2>
            <p className="premium-section-subtitle">Les derniers produits du catalogue</p>
          </div>
          <Link
            href="/boutique"
            className="text-sm font-light tracking-wide text-[#A7B0BC] transition-colors hover:text-[#00AEEF]"
          >
            Tout voir →
          </Link>
        </div>
        <ProductGrid products={products} />
      </section>

      {promos.length > 0 && (
        <section className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="premium-section-label">Offres</p>
              <h2 className="premium-section-title mt-3">Promotions</h2>
              <p className="premium-section-subtitle">Sélection à tarif préférentiel</p>
            </div>
            <Link
              href="/boutique?promo=1"
              className="text-sm font-light tracking-wide text-[#A7B0BC] transition-colors hover:text-[#00AEEF]"
            >
              Voir les promos →
            </Link>
          </div>
          <ProductGrid products={promos} />
        </section>
      )}

      <CategoriesShowcase />
      <BrandsSection />
      <ReviewsSection />
      <ServicesSection />
      <StoresSection />
    </>
  );
}
