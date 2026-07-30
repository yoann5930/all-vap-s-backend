import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ProductCatalog } from "@/components/shop/ProductCatalog";
import { DEFAULT_DESCRIPTION, absoluteUrl } from "@/lib/seo/config";
import { hiddenPublicCategories } from "@/lib/navigation";
import prisma from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Boutique",
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/boutique") },
};

type Props = { searchParams: Promise<{ category?: string }> };

/** Boutique publique — catégories matériel non prêtes → page préparation */
export default async function BoutiquePage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp?.category;
  const cat = (Array.isArray(raw) ? raw[0] : raw || "").toLowerCase().trim();
  if (cat && (hiddenPublicCategories as readonly string[]).includes(cat)) {
    redirect("/catalogue-en-preparation");
  }

  const published = await prisma.product.count({
    where: {
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
    },
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[{ name: "Accueil", path: "/" }, { name: "Boutique", path: "/boutique" }]}
      />
      <div className="mt-4 mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
          Catalogue All Vap&apos;s
        </p>
        <h1 className="mt-1 font-display text-3xl text-white sm:text-4xl">Boutique</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#A7B0BC]">
          Uniquement des références validées (fabricant, gamme, format, photo, SumUp).
        </p>
      </div>

      {published === 0 ? (
        <section className="rounded-2xl border border-white/8 bg-[#101720]/80 px-6 py-16 text-center">
          <h2 className="font-display text-2xl text-white">Catalogue en reconstruction</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-[#A7B0BC]">
            Aucun produit n&apos;est publié pour le moment. Nous préférons un catalogue
            vide à des données incorrectes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/e-liquides"
              className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-premium-black"
            >
              Hub e-liquides
            </Link>
            <Link
              href="/boutiques"
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white"
            >
              Nos boutiques
            </Link>
          </div>
        </section>
      ) : (
        <Suspense
          fallback={
            <div className="py-12 text-center text-[#A7B0BC]">Chargement du catalogue…</div>
          }
        >
          <ProductCatalog heading="E-LIQUIDES" showAvaPanel embedded={false} />
        </Suspense>
      )}
    </div>
  );
}
