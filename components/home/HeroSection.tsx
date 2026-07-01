import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-vap-black">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-vap-black via-vap-charcoal to-brand-950" />
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(5,150,105,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(196,167,125,0.1) 0%, transparent 40%)",
          }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-wood-400/60 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="max-w-3xl">
          <p className="animate-fade-in-up mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-brand-400">
            Boutique officielle
          </p>

          <h1 className="animate-fade-in-up animation-delay-100 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            All Vap&apos;s
          </h1>

          <p className="animate-fade-in-up animation-delay-200 mt-6 text-lg leading-relaxed text-gray-300 sm:text-xl">
            Découvrez les meilleures cigarettes électroniques, e-liquides et accessoires
            dans vos boutiques All Vap&apos;s Hautmont et All Vap&apos;s Le Quesnoy.
          </p>

          <div className="animate-fade-in-up animation-delay-300 mt-10 flex flex-wrap gap-4">
            <Link href="/boutique">
              <Button size="lg" variant="primary" className="gap-2 shadow-lg shadow-brand-600/25">
                Découvrir la boutique
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/boutiques">
              <Button
                size="lg"
                variant="outline-light"
                className="gap-2"
              >
                <MapPin className="h-4 w-4" />
                Nos magasins
              </Button>
            </Link>
          </div>
        </div>

        {/* Decorative element */}
        <div className="pointer-events-none absolute -right-20 top-1/2 hidden -translate-y-1/2 lg:block">
          <div className="h-80 w-80 rounded-full bg-brand-600/10 blur-3xl" />
          <div className="absolute right-20 top-10 h-40 w-40 rounded-full bg-wood-400/10 blur-2xl" />
        </div>
      </div>
    </section>
  );
}
