import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { ManufacturerCatalogCard } from "@/components/catalog/ManufacturerCatalogCard";
import { manufacturerBannerOrLogoIfExists } from "@/lib/catalog/manufacturer-logo.server";
import {
  citesForeignManufacturer,
  extractEliquidVolumeMl,
  formatManufacturerVolumeSubtitle,
  isReadyToVapeEliquid,
  productBelongsToManufacturerForVolumes,
} from "@/lib/catalog/manufacturer-volumes";
import { isRangeCatalogEligible, readRangeOfficialGate } from "@/lib/catalog/official-verification";
import { absoluteUrl } from "@/lib/seo/config";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "E-liquides",
  description:
    "E-liquides All Vap's — navigation Fabricant → Gamme → Produit. Catalogue validé uniquement.",
  alternates: { canonical: absoluteUrl("/e-liquides") },
};

function volumesForManufacturerProducts(
  manufacturer: {
    name: string;
    slug: string;
    products: Array<{
      name: string;
      volumeMl: number | null;
      productType: string | null;
      category: string;
      rangeId: string | null;
      variants: Array<{ capacityMl: number | null }>;
    }>;
  }
): number[] {
  const set = new Set<number>();
  for (const p of manufacturer.products) {
    if (
      !isReadyToVapeEliquid({
        name: p.name,
        category: p.category,
        productType: p.productType,
      })
    ) {
      continue;
    }
    if (/\bconcentr[eé]/i.test(p.name)) continue;
    // « Le primeur » / autres marques glissées sous mauvais fabricant : exclure si le nom cite un autre fabricant connu
    if (
      !productBelongsToManufacturerForVolumes({
        productName: p.name,
        manufacturerName: manufacturer.name,
        manufacturerSlug: manufacturer.slug,
        hasRangeOnManufacturer: Boolean(p.rangeId),
      })
    ) {
      continue;
    }
    // Si le nom cite explicitement un autre fabricant, ne pas compter (même avec rangeId erroné)
    if (citesForeignManufacturer(p.name, manufacturer.slug)) continue;
    const hit = extractEliquidVolumeMl({
      name: p.name,
      volumeMl: p.volumeMl,
      productType: p.productType,
      variantCapacityMl: p.variants.map((v) => v.capacityMl),
    });
    if (hit) set.add(hit.ml);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Hub e-liquides — niveau 1 : FABRICANTS uniquement.
 * Sous-titre carte = contenances réelles du catalogue (auto).
 */
export default async function ELiquidesHubPage() {
  const manufacturers = await prisma.manufacturer.findMany({
    where: {
      isActive: true,
      status: { in: ["verifie", "partiel"] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      products: {
        select: {
          name: true,
          volumeMl: true,
          productType: true,
          category: true,
          rangeId: true,
          variants: { select: { capacityMl: true } },
        },
      },
      ranges: {
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
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
    },
  });

  const publishable = manufacturers.filter((m) => {
    if (!manufacturerBannerOrLogoIfExists(m.slug)) return false;
    return m.ranges.some((r) => {
      if (r.slug === "a-classer") return false;
      if (r.products.length === 0) return false;
      return isRangeCatalogEligible(
        readRangeOfficialGate(r as unknown as Record<string, unknown>)
      );
    });
  });

  const withheld = manufacturers.filter((m) => !publishable.some((p) => p.id === m.id));

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
        {publishable.length === 0 ? (
          <p className="text-sm text-[#A7B0BC]">
            Aucun fabricant publié pour le moment.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publishable.map((m) => {
              const volumes = volumesForManufacturerProducts(m);
              return (
                <li key={m.id}>
                  <ManufacturerCatalogCard
                    name={m.name}
                    slug={m.slug}
                    imageSrc={manufacturerBannerOrLogoIfExists(m.slug)}
                    volumeSubtitle={formatManufacturerVolumeSubtitle(volumes)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {process.env.NODE_ENV === "development" && withheld.length > 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-[#101720]/40 px-5 py-4">
            <p className="text-sm text-[#A7B0BC]">
              Fabricants SumUp non affichés (pas de gamme éligible / cover / logo) —{" "}
              {withheld.length} :
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-white/70">
              {withheld.map((m) => (
                <li key={m.id}>
                  {m.name} <span className="text-white/40">({m.slug})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
