import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { absoluteUrl } from "@/lib/seo/config";
import { productHref } from "@/lib/catalog/product-href";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  const format = await prisma.catalogFormat.findUnique({ where: { code } });
  if (!format) return { title: "Format" };
  return {
    title: `E-liquides ${format.label}`,
    alternates: { canonical: absoluteUrl(`/formats/${format.code}`) },
  };
}

/** Page format — une carte par produit (saveur), pas par dosage */
export default async function FormatPage({ params }: Props) {
  const { code } = await params;
  const format = await prisma.catalogFormat.findUnique({ where: { code } });
  if (!format || !format.isActive) notFound();

  const products = await prisma.product.findMany({
    where: {
      productType: format.code,
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      brand: true,
      range: true,
      manufacturer: { select: { name: true, slug: true } },
      variants: {
        where: { active: true, nicotineMg: { not: null } },
        select: { nicotineMg: true },
        orderBy: { nicotineMg: "asc" },
      },
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "E-liquides", path: "/e-liquides" },
          { name: format.label, path: `/formats/${format.code}` },
        ]}
      />

      <section className="mt-4 rounded-2xl border border-white/8 bg-[#0B1016] px-6 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
          Format
        </p>
        <h1 className="mt-2 font-display text-3xl text-white">{format.label}</h1>
        <p className="mt-2 text-sm text-[#A7B0BC]">
          Produits publiés : {products.length}
        </p>
      </section>

      {products.length === 0 ? (
        <p className="mt-8 text-sm text-[#A7B0BC]">
          Aucun produit {format.label} publié pour le moment.
        </p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const dosages = [
              ...new Set(
                p.variants
                  .map((v) => v.nicotineMg)
                  .filter((n): n is number => n != null)
              ),
            ].sort((a, b) => a - b);
            return (
              <li key={p.id}>
                <a
                  href={productHref(p.slug)}
                  className="block rounded-2xl border border-white/8 bg-[#101720]/80 px-5 py-4"
                >
                  <p className="text-xs text-brand-400">
                    {p.manufacturer?.name || p.brand || "—"}
                    {p.range ? ` · ${p.range}` : ""}
                  </p>
                  <p className="mt-1 font-semibold text-white">{p.name}</p>
                  {dosages.length > 0 && (
                    <p className="mt-2 text-xs text-[#A7B0BC]">
                      Dosages : {dosages.join(", ")} mg
                    </p>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <Link href={`/formats/${format.code}`} className="mt-8 inline-block text-sm text-brand-400">
        ← Rester sur {format.label}
      </Link>
      <Link href="/e-liquides" className="mt-3 ml-4 inline-block text-sm text-[#A7B0BC] hover:text-brand-400">
        Retour e-liquides
      </Link>
    </div>
  );
}
