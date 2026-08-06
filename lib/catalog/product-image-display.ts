/**
 * Réglages d’affichage images catalogue (Next/Image).
 *
 * Les packshots `/media/products/` sont déjà des WebP nettes (q≈92–94, 1200–1600 px).
 * Next/Image les recompressait à q=75 (défaut / allowlist) → flou visible.
 * On sert ces fichiers tels quels (`unoptimized`) pour conserver la netteté source.
 */

/** Grille / cartes produit (URLs distantes encore passées par l’optimiseur) */
export const PRODUCT_CARD_IMAGE_QUALITY = 90;

/** Fiche produit (galerie principale) */
export const PRODUCT_GALLERY_IMAGE_QUALITY = 92;

/** Miniatures (thumbs recherche, suggestions) */
export const PRODUCT_THUMB_IMAGE_QUALITY = 85;

/** sizes responsive — cartes (retina inclus) */
export const PRODUCT_CARD_IMAGE_SIZES =
  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px";

/** sizes fiche produit */
export const PRODUCT_GALLERY_IMAGE_SIZES =
  "(max-width: 1024px) 100vw, min(560px, 50vw)";

/** Packshots locaux déjà encodés — pas de 2e passe Sharp */
export function isPreoptimizedProductMedia(src: string): boolean {
  return (
    src.startsWith("/media/products/") ||
    src.startsWith("/media/catalog/") ||
    src.includes("/media/products/")
  );
}
