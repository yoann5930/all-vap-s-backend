import { ManufacturerLogoMark } from "@/components/catalog/ManufacturerLogoMark";

type Props = {
  name: string;
  slug?: string | null;
  className?: string;
  /** Hauteur visuelle du logo (px) */
  height?: number;
};

/** Logo fabricant officiel, sinon texte en fallback. */
export function ManufacturerLogo({ name, slug, className = "", height = 28 }: Props) {
  return (
    <ManufacturerLogoMark
      name={name}
      slug={slug}
      className={className}
      mode="inline"
      height={height}
    />
  );
}
