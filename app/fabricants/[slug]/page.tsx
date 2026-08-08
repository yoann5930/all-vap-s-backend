import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RangeCatalogCard } from "@/components/catalog/RangeCatalogCard";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { isRangeCatalogEligible, readRangeOfficialGate } from "@/lib/catalog/official-verification";
import { manufacturerBannerOrLogoIfExists, manufacturerLogoUrlIfExists } from "@/lib/catalog/manufacturer-logo.server";
import { rangeCoverUrl } from "@/lib/catalog/range-cover";
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
    description: `${m.name} — gammes officielles All Vap's.`,
    alternates: { canonical: absoluteUrl(`/fabricants/${m.slug}`) },
  };
}

/**
 * Niveau 2 — gammes officiellement validées de CE fabricant uniquement.
 * Pas de produits à ce niveau. Pas de gammes d'un autre fabricant.
 */
export default async function FabricantPage({ params }: Props) {
  const { slug } = await params;
  // select explicite (pas include *) — schéma prod parfois partiel
  const manufacturer = await prisma.manufacturer.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      ranges: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          verificationStatus: true,
          catalogVisible: true,
          products: {
            where: {
              visibleOnline: true,
              isActive: true,
              catalogStatus: { in: ["valide", "actif"] },
            },
            select: { id: true },
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
    notFound();
  }

  const logo =
    manufacturerLogoUrlIfExists(manufacturer.slug) ||
    manufacturerBannerOrLogoIfExists(manufacturer.slug);
  if (!logo) notFound();

  const validatedRanges = manufacturer.ranges.filter((r) => {
    // Collections / sous-séries ne doivent jamais apparaître comme gammes
    if (/blackout/i.test(r.slug) && r.slug !== "call-of-vape") return false;
    if (/call-of-vape-blackout/i.test(r.slug)) return false;
    if (r.products.length === 0) return false;
    if (!rangeCoverUrl(manufacturer.slug, r.slug)) return false;
    const gate = readRangeOfficialGate(r as unknown as Record<string, unknown>);
    return isRangeCatalogEligible(gate);
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "E-liquides", path: "/e-liquides" },
          { name: manufacturer.name, path: `/fabricants/${manufacturer.slug}` },
        ]}
      />

      <p className="mt-4">
        <Link
          href="/e-liquides"
          className="text-sm text-brand-400 transition hover:text-brand-300"
        >
          ← Retour aux fabricants
        </Link>
      </p>

      <section className="relative mt-4 overflow-hidden rounded-2xl border border-white/8">
        <div
          className="relative flex min-h-[160px] flex-col items-start justify-center gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 80% 50%, rgba(0,174,239,0.2) 0%, transparent 55%), #0B1016",
          }}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
              Fabricant
            </p>
            <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">
              {manufacturer.name}
            </h1>
            <p className="mt-2 text-sm text-[#A7B0BC]">
              Gammes officiellement validées uniquement.
            </p>
          </div>
          {logo ? (
            <div className="flex h-24 w-full max-w-[280px] shrink-0 items-center justify-center rounded-2xl border border-brand-400/30 bg-[#101720]/90 px-6 sm:h-28">
              <Image
                src={logo}
                alt={manufacturer.name}
                width={240}
                height={96}
                className="max-h-16 w-auto max-w-full object-contain"
                unoptimized
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-white">Gammes</h2>
        <p className="mt-1 text-sm text-[#A7B0BC]">
          Une gamme = un seul fabricant. Aucun mélange. Aucun détail produit ici.
        </p>
        {validatedRanges.length === 0 ? (
          <p className="mt-4 text-sm text-[#A7B0BC]">
            Aucune gamme officiellement confirmée pour le moment.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {validatedRanges.map((r) => (
              <li key={r.id}>
                <RangeCatalogCard
                  name={r.name}
                  slug={r.slug}
                  manufacturerSlug={manufacturer.slug}
                  manufacturerName={manufacturer.name}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
