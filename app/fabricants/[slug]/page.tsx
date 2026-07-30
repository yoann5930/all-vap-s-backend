import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl } from "@/lib/seo/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const m = await prisma.manufacturer.findUnique({ where: { slug } });
  if (!m) return { title: "Fabricant" };
  return {
    title: m.name,
    description: `${m.name} — e-liquides All Vap's (catalogue en reconstruction).`,
    alternates: { canonical: absoluteUrl(`/fabricants/${m.slug}`) },
  };
}

/**
 * Page fabricant — structure seule.
 * Aucun produit d'un autre fabricant. Aucune photo inventée.
 */
export default async function FabricantPage({ params }: Props) {
  const { slug } = await params;
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { slug },
    include: {
      ranges: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          products: {
            where: {
              visibleOnline: true,
              isActive: true,
              catalogStatus: { in: ["valide", "actif"] },
            },
            select: { id: true, productType: true },
          },
        },
      },
      products: {
        where: {
          visibleOnline: true,
          isActive: true,
          catalogStatus: { in: ["valide", "actif"] },
        },
        select: { id: true },
      },
    },
  });

  if (!manufacturer) notFound();
  if (manufacturer.status === "a_verifier" && manufacturer.products.length === 0) {
    // Fabricant non assez fiable et sans produits publiés → pas de page marketing
    notFound();
  }

  const published = manufacturer.products.length;
  const publishedRanges = manufacturer.ranges.filter((r) => r.products.length > 0);
  const rangesWithoutProducts = manufacturer.ranges.filter((r) => r.products.length === 0);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "E-liquides", path: "/e-liquides" },
          { name: manufacturer.name, path: `/fabricants/${manufacturer.slug}` },
        ]}
      />

      {/* Bandeau premium — sans photos produits inventées */}
      <section className="relative mt-4 overflow-hidden rounded-2xl border border-white/8">
        <div
          className="relative min-h-[200px] px-6 py-12 sm:px-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 80% 50%, rgba(0,174,239,0.2) 0%, transparent 55%), #0B1016",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
            Fabricant
          </p>
          <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">
            {manufacturer.name}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-[#A7B0BC]">
            {manufacturer.website
              ? `Site fabricant : ${manufacturer.website}`
              : "Présentation détaillée à compléter après validation."}
          </p>
          <p className="mt-2 text-xs uppercase tracking-wider text-white/50">
            Statut référentiel : {manufacturer.status} · Produits publiés : {published}
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-white">Gammes</h2>
        <p className="mt-1 text-sm text-[#A7B0BC]">
          Une gamme = un seul fabricant. Aucun mélange.
        </p>
        {publishedRanges.length === 0 ? (
          <p className="mt-4 text-sm text-[#A7B0BC]">Aucune gamme publiée pour le moment.</p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publishedRanges.map((r) => {
              const count = r.products.length;
              const formatsLabel = [
                ...new Set(r.products.map((p) => p.productType).filter(Boolean)),
              ]
                .map((f) => (f || "").replace("ml", " ml"))
                .join(" · ");
              const formatsFallback = (r.formatCodes || [])
                .map((f) => f.replace("ml", " ml"))
                .join(" · ");
              return (
              <li key={r.id}>
                <Link
                  href={`/gammes/${r.slug}?fabricant=${manufacturer.slug}`}
                  className="block rounded-2xl border border-white/8 bg-[#101720]/80 px-5 py-4 transition hover:border-brand-400/40"
                >
                  <p className="font-semibold text-white">{r.name}</p>
                  <p className="mt-1 text-sm text-[#A7B0BC]">
                    {count} produit{count > 1 ? "s" : ""}
                    {formatsLabel || formatsFallback
                      ? ` · ${formatsLabel || formatsFallback}`
                      : ""}
                  </p>
                </Link>
              </li>
              );
            })}
          </ul>
        )}
        {rangesWithoutProducts.length > 0 && (
          <p className="mt-4 text-xs text-white/40">
            Gammes référencées sans produit publié (non listées) :{" "}
            {rangesWithoutProducts.map((r) => r.name).join(", ")}.
          </p>
        )}
      </section>

      {published === 0 && (
        <section className="mt-10 rounded-2xl border border-dashed border-white/10 px-6 py-8 text-center">
          <p className="text-sm text-[#A7B0BC]">
            Aucun produit {manufacturer.name} n&apos;est encore publié en ligne.
            Les associations photo + SumUp sont en cours de validation.
          </p>
          <Link href="/e-liquides" className="mt-4 inline-block text-sm text-brand-400">
            ← Retour e-liquides
          </Link>
        </section>
      )}
    </div>
  );
}
