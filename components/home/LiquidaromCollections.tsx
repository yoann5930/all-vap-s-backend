"use client";

import Image from "next/image";
import Link from "next/link";

const COLLECTIONS = [
  {
    src: "/products/liquidarom/ice-cool-rayon-01-card.webp",
    alt: "Sélection Ice Cool Liquidarom, saveurs fruitées et fraîches",
    title: "Ice Cool",
    subtitle: "Fruité & frais",
    href: "/boutique?search=Ice%20Cool",
  },
  {
    src: "/products/liquidarom/ice-cool-rayon-02-card.webp",
    alt: "Gamme Ice Cool Liquidarom en boutique All Vap's",
    title: "Gamme Ice Cool",
    subtitle: "En boutique",
    href: "/boutique?brand=liquidarom",
  },
  {
    src: "/products/liquidarom/liquidarom-selection-card.webp",
    alt: "Sélection Liquidarom et Les Essentiels",
    title: "Liquidarom",
    subtitle: "Sélection boutique",
    href: "/boutique?brand=liquidarom",
  },
  {
    src: "/products/liquidarom/ice-cool-premium-card.webp",
    alt: "Flacons Liquidarom Ice Cool aux saveurs fruitées",
    title: "Ice Cool Premium",
    subtitle: "Mise en avant",
    href: "/boutique?search=Ice%20Cool",
  },
];

/** Cartes collection — photos de rayon (pas fiches individuelles) */
export function LiquidaromCollections() {
  return (
    <section aria-labelledby="liquidarom-collections-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
            Liquidarom
          </p>
          <h2
            id="liquidarom-collections-title"
            className="mt-1 font-display text-xl font-bold text-white sm:text-2xl"
          >
            Nos gammes en boutique
          </h2>
        </div>
        <Link
          href="/boutique?brand=liquidarom"
          className="text-sm text-[#A7B0BC] transition-colors hover:text-brand-400"
        >
          Tout voir →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {COLLECTIONS.map((card) => (
          <Link
            key={card.src}
            href={card.href}
            className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/8 bg-[#0B1016]"
          >
            <Image
              src={card.src}
              alt={card.alt}
              fill
              loading="lazy"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <p className="text-sm font-semibold text-white">{card.title}</p>
              <p className="text-[11px] text-[#A7B0BC]">{card.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
