/** URL canonique fiche produit catalogue. */
export function productHref(slug: string): string {
  const clean = (slug || "").replace(/^\/+/, "").trim();
  return `/boutique/${clean}`;
}
