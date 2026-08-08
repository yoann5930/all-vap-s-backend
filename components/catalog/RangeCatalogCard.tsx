import Image from "next/image";
import Link from "next/link";
import { rangeCoverUrl } from "@/lib/catalog/range-cover";

type Props = {
  name: string;
  slug: string;
  manufacturerSlug: string;
  manufacturerName?: string;
  /** Nombre de produits publiés dans la gamme (sous-titre). */
  productCount?: number;
  /** Contenances détectées, ex. [10, 50, 100]. */
  volumesMl?: number[];
  /** Autoriser carte typographique si cover absent (défaut false = comportement historique). */
  allowTypographicFallback?: boolean;
};

/**
 * Case catalogue niveau 2 — cover officiel si dispo, sinon typo (si autorisé).
 * Pas de fallback logo fabricant (interdit : mélange visuel).
 */
export function RangeCatalogCard({
  name,
  slug,
  manufacturerSlug,
  manufacturerName,
  productCount,
  volumesMl,
  allowTypographicFallback = false,
}: Props) {
  if (slug === "a-classer") return null;

  const cover = rangeCoverUrl(manufacturerSlug, slug);
  if (!cover && !allowTypographicFallback) return null;

  const href = `/gammes/${slug}?fabricant=${manufacturerSlug}`;
  const volumeLine =
    volumesMl && volumesMl.length
      ? volumesMl
          .slice()
          .sort((a, b) => a - b)
          .map((ml) => `${ml} ML`)
          .join(" · ")
      : null;
  const subtitleParts = [
    productCount != null ? `E-LIQUIDES · ${productCount} PRODUIT${productCount > 1 ? "S" : ""}` : "E-LIQUIDES",
    volumeLine,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" · ");

  return (
    <Link
      href={href}
      aria-label={`Ouvrir la gamme ${name}${manufacturerName ? ` — ${manufacturerName}` : ""}`}
      title={`${name}${subtitle ? ` — ${subtitle}` : ""}`}
      className="group block overflow-hidden rounded-2xl border border-brand-400/30 bg-[#101720]/80 transition hover:border-brand-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
    >
      <div className="relative aspect-[16/10] bg-[#0B1016]">
        {cover ? (
          <Image
            src={cover}
            alt={`Gamme ${name}`}
            fill
            className="object-contain object-center p-3 transition duration-300 group-hover:scale-[1.02] sm:p-4"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center">
            <p className="font-display text-2xl font-semibold tracking-wide text-white sm:text-3xl">
              {name}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-semibold text-white drop-shadow-md">{name}</p>
          {subtitle ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
