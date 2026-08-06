import Image from "next/image";
import Link from "next/link";
import { rangeCoverUrl } from "@/lib/catalog/range-cover";

type Props = {
  name: string;
  slug: string;
  manufacturerSlug: string;
  manufacturerName?: string;
};

/**
 * Case catalogue niveau 2 — cover officiel obligatoire.
 * Pas de fallback logo fabricant (interdit : mélange visuel).
 */
export function RangeCatalogCard({
  name,
  slug,
  manufacturerSlug,
  manufacturerName,
}: Props) {
  const cover = rangeCoverUrl(manufacturerSlug, slug);
  if (!cover) return null;

  const href = `/gammes/${slug}?fabricant=${manufacturerSlug}`;

  return (
    <Link
      href={href}
      aria-label={`Ouvrir la gamme ${name}${manufacturerName ? ` — ${manufacturerName}` : ""}`}
      title={name}
      className="group block overflow-hidden rounded-2xl border border-brand-400/30 bg-[#101720]/80 transition hover:border-brand-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
    >
      <div className="relative aspect-[16/10] bg-[#0B1016]">
        <Image
          src={cover}
          alt={`Gamme ${name}`}
          fill
          className="object-contain object-center p-3 transition duration-300 group-hover:scale-[1.02] sm:p-4"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-semibold text-white drop-shadow-md">{name}</p>
        </div>
      </div>
    </Link>
  );
}
