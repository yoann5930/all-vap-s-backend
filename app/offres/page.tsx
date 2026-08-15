import Link from "next/link";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { TenMlOfferBanner } from "@/components/offres/TenMlOfferBanner";
import { TwentyOfferBanner } from "@/components/promotions/TwentyOfferBanner";
import { absoluteUrl } from "@/lib/seo/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Offres",
  description:
    "Offres boutique All Vap's : E-Tasty One Taste 10 ml et Twenty dégressive. Remise au panier, prix catalogue inchangé.",
  alternates: { canonical: absoluteUrl("/offres") },
};

export default function OffresPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[
          { name: "Accueil", path: "/" },
          { name: "Offres", path: "/offres" },
        ]}
      />

      <section className="mt-4 rounded-2xl border border-white/8 bg-[#0B1016] px-6 py-10 sm:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
          Boutique
        </p>
        <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">Offres</h1>
        <p className="mt-3 max-w-2xl text-sm text-[#A7B0BC]">
          Ce ne sont pas des promotions catalogue : le prix affiché reste celui de la caisse. La
          remise se calcule au panier. A.V.A. vérifie l’offre avant le paiement.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <TenMlOfferBanner />
          <Link
            href="/offres/10ml"
            className="text-sm font-medium text-brand-400 hover:text-brand-300"
          >
            Voir les One Taste 10 ml éligibles →
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          <TwentyOfferBanner />
          <Link
            href="/offres/twenty"
            className="text-sm font-medium text-brand-400 hover:text-brand-300"
          >
            Voir la gamme Twenty →
          </Link>
        </div>
      </div>
    </div>
  );
}
