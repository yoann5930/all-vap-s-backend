import Link from "next/link";
import { HeroSection } from "@/components/home/HeroSection";
import { AdvantagesSection } from "@/components/home/AdvantagesSection";
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

export default async function HomePage() {
  const products = await getFeaturedProducts();

  return (
    <>
      <HeroSection />
      <AdvantagesSection />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-brand-600">
              Sélection premium
            </p>
            <h2 className="mt-2 text-3xl font-bold text-vap-black">Nouveautés</h2>
            <p className="mt-2 text-gray-600">
              Les derniers produits ajoutés à notre catalogue
            </p>
          </div>
          <Link
            href="/boutique"
            className="inline-flex items-center text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
          >
            Tout voir →
          </Link>
        </div>
        <ProductGrid products={products} />
      </section>

      <StoresSection />
    </>
  );
}
