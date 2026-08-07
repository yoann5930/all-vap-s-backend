import Link from "next/link";
import Image from "next/image";
import { ManufacturerLogoMark } from "@/components/catalog/ManufacturerLogoMark";

type Props = {
  name: string;
  slug: string;
  /** URL vérifiée côté serveur (banner.webp ou logo). */
  imageSrc?: string | null;
};

/**
 * Case catalogue niveau 1 — bannière fabricant 16:10.
 * Nom conservé pour a11y (aria-label / alt).
 */
export function ManufacturerCatalogCard({ name, slug, imageSrc }: Props) {
  if (!imageSrc) return null;
  const isBanner = imageSrc.endsWith("/banner.webp");

  return (
    <Link
      href={`/fabricants/${slug}`}
      aria-label={`Ouvrir les gammes ${name}`}
      title={name}
      className="group flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border border-brand-400/30 bg-[#101720]/80 transition hover:border-brand-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
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
    </Link>
  );
}
