import Link from "next/link";
import { ManufacturerLogoMark } from "@/components/catalog/ManufacturerLogoMark";
import { manufacturerLogoUrl } from "@/lib/catalog/manufacturer-logo";

type Props = {
  name: string;
  slug: string;
};

/**
 * Case catalogue niveau 1 — logo fabricant seul, centré, lisible.
 * Nom conservé pour a11y (aria-label / alt), pas affiché visuellement.
 */
export function ManufacturerCatalogCard({ name, slug }: Props) {
  const src = manufacturerLogoUrl(slug);
  if (!src) return null;

  return (
    <Link
      href={`/fabricants/${slug}`}
      aria-label={`Ouvrir les gammes ${name}`}
      title={name}
      className="group flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border border-brand-400/30 bg-[#101720]/80 transition hover:border-brand-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
    >
      <ManufacturerLogoMark name={name} slug={slug} mode="card" className="h-full w-full" />
    </Link>
  );
}
