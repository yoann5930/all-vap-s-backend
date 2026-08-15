import Link from "next/link";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ProductGrid } from "@/components/products/ProductGrid";
import { TenMlOfferBanner } from "@/components/offres/TenMlOfferBanner";
import { isPromo10mlEligible } from "@/lib/promotions/promo-10ml";
import { absoluteUrl } from "@/lib/seo/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Offre 10 ml — 5+1",
  description:
    "Offre boutique All Vap's : 5 e-liquides 10 ml + 1 offert. Remise au panier uniquement.",
  alternates: { canonical: absoluteUrl("/offres/10ml") },
};

const productInclude = {
  flavors: true,
  variants: true,
  catalogImages: { orderBy: { sortOrder: "asc" as const } },
  manufacturer: { select: { id: true, slug: true, name: true } },
  rangeRef: {
    select: {
      id: true,
      name: true,
      slug: true,
      manufacturerId: true,
      manufacturer: { select: { id: true, slug: true } },
    },
  },
};

export default async function Offre10mlPage() {
  const raw = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: true,
      catalogStatus: { in: ["valide", "actif"] },
      promotion10mlEligible: true,
      volumeMl: 10,
    },
    include: productInclude,
    orderBy: { name: "asc" },
  });

  const products = raw.filter((p) =>
    isPromo10mlEligible({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      promotion10mlEligible: p.promotion10mlEligible,
      visibleOnline: p.visibleOnline,
      isActive: p.isActive,
      catalogStatus: p.catalogStatus,
      stock: p.stock,
    })
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "Offres", path: "/offres" },
          { name: "10 ml 5+1", path: "/offres/10ml" },
        ]}
      />
      <div className="mt-4">
        <TenMlOfferBanner />
      </div>
      <p className="mt-4 text-sm">
        <Link href="/offres" className="text-brand-400 hover:text-brand-300">
          ← Toutes les offres
        </Link>
      </p>
      <section className="mt-8">
        <h2 className="font-display text-xl text-white">E-liquides 10 ml éligibles</h2>
        <div className="mt-5">
          <ProductGrid products={products} />
        </div>
      </section>
    </div>
  );
}
