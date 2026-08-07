import Link from "next/link";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ManufacturerCatalogCard } from "@/components/catalog/ManufacturerCatalogCard";
import { manufacturerBannerOrLogoIfExists } from "@/lib/catalog/manufacturer-logo.server";
import { absoluteUrl } from "@/lib/seo/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "E-liquides",
  description:
    "E-liquides All Vap's — navigation Fabricant → Gamme → Produit. Catalogue validé uniquement.",
  alternates: { canonical: absoluteUrl("/e-liquides") },
};

/**
 * Hub e-liquides — niveau 1 : FABRICANTS uniquement.
 * Chaque case = logo officiel. Aucun texte produit / gamme / compteur.
 */
export default async function ELiquidesHubPage() {
  const manufacturers = await prisma.manufacturer.findMany({
    where: {
      isActive: true,
      status: { in: ["verifie", "partiel"] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  const withLogo = manufacturers.filter((m) => !!manufacturerBannerOrLogoIfExists(m.slug));
  const missingLogo = manufacturers.filter((m) => !manufacturerBannerOrLogoIfExists(m.slug));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "E-liquides", path: "/e-liquides" },
        ]}
      />

      <div className="mt-4 mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
          Catalogue
        </p>
        <h1 className="mt-1 font-display text-3xl text-white sm:text-4xl">E-liquides</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#A7B0BC]">
          Choisissez un fabricant, puis une gamme, puis un produit.
        </p>
      </div>

      <section>
        <h2 className="sr-only">Fabricants</h2>
        {withLogo.length === 0 ? (
          <p className="text-sm text-[#A7B0BC]">
            Aucun fabricant publié pour le moment.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withLogo.map((m) => (
              <li key={m.id}>
                <ManufacturerCatalogCard
                  name={m.name}
                  slug={m.slug}
                  imageSrc={manufacturerBannerOrLogoIfExists(m.slug)}
                />
              </li>
            ))}
          </ul>
        )}

        {missingLogo.length > 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-[#101720]/40 px-5 py-4">
            <p className="text-sm text-[#A7B0BC]">
              Fabricants avec produits publiés mais <strong className="text-white/80">sans logo officiel</strong>{" "}
              en base locale (non affichés pour respecter la règle « logo seul ») :
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-white/70">
              {missingLogo.map((m) => (
                <li key={m.id}>
                  <Link href={`/fabricants/${m.slug}`} className="text-brand-400 hover:underline">
                    {m.name}
                  </Link>
                  <span className="text-white/40"> — logo à récupérer ({m.slug})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
