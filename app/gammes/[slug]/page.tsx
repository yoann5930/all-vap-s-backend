import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ProductCard } from "@/components/products/ProductCard";
import { isRangeCatalogEligible, readRangeOfficialGate } from "@/lib/catalog/official-verification";
import { rangeCoverUrl } from "@/lib/catalog/range-cover";
import { filterProductsZeroMix } from "@/lib/catalog/zero-mix-gate";
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
    select: { name: true, slug: true },
  });
  if (!range) return { title: "Gamme" };
  return {
    title: range.name,
    description: `Gamme ${range.name} — All Vap's`,
    alternates: { canonical: absoluteUrl(`/gammes/${range.slug}`) },
  };
}

/**
 * Niveau 3 — produits officiels de CETTE gamme uniquement.
 */
export default async function GammePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const range = await prisma.productRange.findFirst({
    where: {
      slug,
      ...(sp.fabricant ? { manufacturer: { slug: sp.fabricant } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      manufacturerId: true,
      verificationStatus: true,
      catalogVisible: true,
      isActive: true,
      manufacturer: { select: { id: true, slug: true, name: true } },
      brand: { select: { id: true, slug: true, name: true } },
    },
  });

  if (!range) notFound();

  if (!isRangeCatalogEligible(readRangeOfficialGate(range as unknown as Record<string, unknown>))) {
    notFound();
  }

  const productsRaw = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
      rangeId: range.id,
      manufacturerId: range.manufacturerId ?? undefined,
      ...(range.slug === "ice-cool"
        ? {
            NOT: {
              OR: [
                { productFamily: "ICE_COOL_X" },
                { name: { contains: "Ice Cool X", mode: "insensitive" } },
              ],
            },
          }
        : {}),
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

  const { ok: products } = filterProductsZeroMix(productsRaw);

  // Couverture gamme obligatoire
  if (!rangeCoverUrl(range.manufacturer?.slug, range.slug)) {
    notFound();
  }

  const fab = range.manufacturer;

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

      <p className="mt-4 flex flex-wrap gap-4 text-sm">
        {fab ? (
          <Link href={`/fabricants/${fab.slug}`} className="text-brand-400 hover:text-brand-300">
            ← Retour aux gammes {fab.name}
          </Link>
        ) : null}
        <Link href="/e-liquides" className="text-[#A7B0BC] hover:text-white">
          ← Retour aux fabricants
        </Link>
      </p>

      <section className="relative mt-4 overflow-hidden rounded-2xl border border-white/8">
        <div
          className="relative min-h-[160px] px-6 py-10 sm:px-10"
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
    </div>
  );
}
