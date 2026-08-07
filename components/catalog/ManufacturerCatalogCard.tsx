import Link from "next/link";
import Image from "next/image";
import { ManufacturerLogoMark } from "@/components/catalog/ManufacturerLogoMark";

type Props = {
  name: string;
  slug: string;
  /** URL vérifiée côté serveur (banner.webp ou logo). */
  imageSrc?: string | null;
  /** Ex. « E-LIQUIDES · 10 ML · 50 ML » — calculé depuis le catalogue. */
  volumeSubtitle?: string | null;
};

/**
 * Case catalogue niveau 1 — bannière fabricant 16:10.
 * Sous-titre = contenances réelles du catalogue (pas de texte statique).
 */
export function ManufacturerCatalogCard({
  name,
  slug,
  imageSrc,
  volumeSubtitle,
}: Props) {
  if (!imageSrc) return null;
  const isBanner = imageSrc.endsWith("/banner.webp");
  const subtitle = (volumeSubtitle || "E-LIQUIDES").trim();

  return (
    <Link
      href={`/fabricants/${slug}`}
      aria-label={`Ouvrir les gammes ${name} — ${subtitle}`}
      title={`${name} — ${subtitle}`}
      className="group relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border border-brand-400/30 bg-[#101720]/80 transition hover:border-brand-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
    >
      {isBanner ? (
        <Image
          src={imageSrc}
          alt={`Bannière ${name}`}
          width={1600}
          height={1000}
          className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.02]"
          unoptimized
        />
      ) : (
        <ManufacturerLogoMark
          name={name}
          slug={slug}
          mode="card"
          className="h-full w-full"
        />
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1016]/95 via-[#0B1016]/75 to-transparent px-3 pb-2.5 pt-10 sm:px-4 sm:pb-3 sm:pt-12"
        aria-hidden={!volumeSubtitle}
      >
        <p className="text-center text-[9px] font-semibold uppercase leading-snug tracking-[0.14em] text-[#A7B0BC] sm:text-[10px] sm:tracking-[0.16em]">
          {subtitle}
        </p>
      </div>
    </Link>
  );
}
