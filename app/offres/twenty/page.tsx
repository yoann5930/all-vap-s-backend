import Link from "next/link";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ProductGrid } from "@/components/products/ProductGrid";
import { TwentyOfferBanner } from "@/components/promotions/TwentyOfferBanner";
import { absoluteUrl } from "@/lib/seo/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Offre Twenty dégressive",
  description:
    "Offre boutique All Vap's Twenty 20 ml : paliers dégressifs au panier, prix catalogue 12,90 €.",
  alternates: { canonical: absoluteUrl("/offres/twenty") },
};

export default async function OffreTwentyPage() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: true,
      catalogStatus: { in: ["valide", "actif"] },
      OR: [{ productFamily: "ETASTY_TWENTY" }, { rangeRef: { slug: "twenty" } }],
    },
    include: {
      flavors: true,
      variants: true,
      catalogImages: { orderBy: { sortOrder: "asc" } },
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
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "Offres", path: "/offres" },
          { name: "Twenty", path: "/offres/twenty" },
        ]}
      />
      <div className="mt-4">
        <TwentyOfferBanner />
      </div>
      <p className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link href="/offres" className="text-brand-400 hover:text-brand-300">
          ← Toutes les offres
        </Link>
        <Link
          href="/gammes/twenty?fabricant=e-tasty"
          className="text-[#A7B0BC] hover:text-white"
        >
          Page gamme Twenty
        </Link>
      </p>
      <section className="mt-8">
        <h2 className="font-display text-xl text-white">Twenty 20 ml</h2>
        <div className="mt-5">
          <ProductGrid products={products} />
        </div>
      </section>
    </div>
  );
}
