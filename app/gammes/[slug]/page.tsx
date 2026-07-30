import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ProductCard } from "@/components/products/ProductCard";
import { absoluteUrl } from "@/lib/seo/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fabricant?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const range = await prisma.productRange.findFirst({
    where: { slug },
    include: { brand: true, manufacturer: true },
  });
  if (!range) return { title: "Gamme" };
  return {
    title: range.name,
    description: `Gamme ${range.name} — All Vap's`,
    alternates: { canonical: absoluteUrl(`/gammes/${range.slug}`) },
  };
}

/**
 * Page gamme catalogue.
 * Affiche UNIQUEMENT les produits publiés de CETTE gamme.
 * N'affecte pas la page d'accueil.
 */
export default async function GammePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const range = await prisma.productRange.findFirst({
    where: {
      slug,
      ...(sp.fabricant ? { manufacturer: { slug: sp.fabricant } } : {}),
    },
    include: {
      manufacturer: true,
      brand: true,
    },
  });

  if (!range) notFound();

  // Filtre strict gamme : rangeId OU (range name + family) pour Ice Cool
  const products = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
      OR: [
        { rangeId: range.id },
        {
          AND: [
            { range: { equals: range.name, mode: "insensitive" } },
            ...(range.slug === "ice-cool"
              ? [{ productFamily: "ICE_COOL" as const }]
              : []),
          ],
        },
      ],
      // Jamais Ice Cool X sur page Ice Cool
      ...(range.slug === "ice-cool"
        ? {
            NOT: {
              OR: [
                { productFamily: "ICE_COOL_X" },
                { name: { contains: "Ice Cool X", mode: "insensitive" } },
                { range: { contains: "Ice Cool X", mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: {
      flavors: true,
      variants: true,
      catalogImages: { orderBy: { sortOrder: "asc" } },
      rangeRef: true,
    },
    orderBy: { name: "asc" },
  });

  const fab = range.manufacturer;
  const formats = [...new Set(products.map((p) => p.productType).filter(Boolean))];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "E-liquides", path: "/e-liquides" },
          ...(fab ? [{ name: fab.name, path: `/fabricants/${fab.slug}` }] : []),
          { name: range.name, path: `/gammes/${range.slug}` },
        ]}
      />

      <section className="relative mt-4 overflow-hidden rounded-2xl border border-white/8">
        <div
          className="relative min-h-[180px] px-6 py-12 sm:px-10"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 75% 40%, rgba(0,174,239,0.18) 0%, transparent 55%), #0B1016",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
            Gamme{fab ? ` · ${fab.name}` : ""}
          </p>
          <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">
            {range.name}
          </h1>
          <p className="mt-3 text-sm text-[#A7B0BC]">
            {products.length} produit{products.length > 1 ? "s" : ""} publié
            {products.length > 1 ? "s" : ""}
            {formats.length ? ` · Format${formats.length > 1 ? "s" : ""} : ${formats.join(", ")}` : ""}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-white">Produits</h2>
        {products.length === 0 ? (
          <p className="mt-4 text-sm text-[#A7B0BC]">
            Aucun produit de cette gamme n&apos;est encore publié.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-10">
        <Link
          href={fab ? `/fabricants/${fab.slug}` : "/e-liquides"}
          className="text-sm text-brand-400"
        >
          ← Retour {fab ? fab.name : "e-liquides"}
        </Link>
      </div>
    </div>
  );
}
