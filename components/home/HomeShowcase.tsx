import dynamic from "next/dynamic";
import Link from "next/link";
import { HeroSection } from "@/components/home/HeroSection";
import { AvaSidePanel } from "@/components/home/AvaSidePanel";
import { TrustBar } from "@/components/home/TrustBar";

/**
 * Chunks client isolés — évite le TypeError Webpack
 * « Cannot read properties of undefined (reading 'call') » en HMR.
 */
const FindNearestStore = dynamic(
  () =>
    import("@/components/home/FindNearestStore").then((m) => m.FindNearestStore),
  {
    loading: () => (
      <section className="border-t border-white/5 bg-[#0b1018] py-10 sm:py-12" aria-hidden>
        <div className="mx-auto max-w-7xl px-4 text-sm text-[#A7B0BC]">Chargement…</div>
      </section>
    ),
  }
);

const StoresSection = dynamic(
  () => import("@/components/home/StoresSection").then((m) => m.StoresSection),
  { loading: () => null }
);

/**
 * Accueil = vitrine institutionnelle.
 * Aucun produit automatique, aucune collection rayon, aucune promo générée.
 * Esthétique All Vap's conservée.
 */
export function HomeShowcase() {
  return (
    <>
      <HeroSection />

      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
          <div className="min-w-0 space-y-6">
            <section className="rounded-2xl border border-white/8 bg-[#101720]/80 px-6 py-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
                All Vap&apos;s
              </p>
              <h2 className="mt-2 font-display text-2xl text-white sm:text-3xl">
                La vape premium à Hautmont &amp; Le Quesnoy
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#A7B0BC]">
                Boutique spécialisée : conseils d&apos;experts, sélection rigoureuse
                et accompagnement personnalisé. Le catalogue en ligne est en cours
                de reconstruction — seules les références validées seront publiées.
              </p>
            </section>

            <section className="rounded-2xl border border-white/8 bg-[#101720]/80 px-6 py-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
                Catalogue
              </p>
              <h2 className="mt-2 font-display text-2xl text-white sm:text-3xl">
                E-liquides
              </h2>
              <p className="mt-3 max-w-lg text-sm text-[#A7B0BC]">
                Navigation par fabricant, gamme et format — dès que les fiches
                auront été validées une à une.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/e-liquides"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-premium-black transition hover:bg-brand-400"
                >
                  Voir les e-liquides
                </Link>
                <Link
                  href="/boutiques"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-400"
                >
                  Nos boutiques
                </Link>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-36">
              <AvaSidePanel />
            </div>
          </aside>
        </div>
      </div>

      <div className="mt-8 lg:mt-10">
        <TrustBar />
      </div>

      <FindNearestStore />

      <StoresSection />
    </>
  );
}
