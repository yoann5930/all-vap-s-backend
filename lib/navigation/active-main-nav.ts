/**
 * Détection exclusive de l'onglet principal actif.
 * Un seul onglet peut être actif à la fois.
 */

export type MainNavId =
  | "e-liquides"
  | "resistances"
  | "marques"
  | "pods"
  | "e-cigarettes"
  | "accessoires"
  | "diy"
  | "boutiques"
  | "faq"
  | "contact"
  | "admin"
  | null;

export type ProductNavContext = {
  /** Catégorie métier réelle du produit chargé */
  navId: MainNavId;
  productType?: string | null;
  category?: string | null;
  manufacturerSlug?: string | null;
  rangeSlug?: string | null;
  volumeMl?: number | null;
};

/** Mappe un href de nav vers un identifiant exclusif */
export function navIdFromHref(href: string, label = ""): MainNavId {
  const base = href.split("?")[0].replace(/\/$/, "") || "/";
  const q = href.includes("?") ? href.split("?")[1] : "";
  void label;

  if (base === "/e-liquides" || q.includes("category=e-liquides")) return "e-liquides";
  if (base === "/resistances" || base.startsWith("/resistances/") || q.includes("category=resistances"))
    return "resistances";
  if (base === "/marques" || base.startsWith("/marques/")) return "marques";
  if (base === "/pods" || base.startsWith("/pods/") || q.includes("category=pods")) return "pods";
  if (
    base === "/cigarettes-electroniques" ||
    base.startsWith("/cigarettes-electroniques/") ||
    q.includes("category=cigarettes")
  )
    return "e-cigarettes";
  if (base === "/accessoires" || base.startsWith("/accessoires/") || q.includes("category=accessoires"))
    return "accessoires";
  if (base === "/diy" || base.startsWith("/diy/") || q.includes("category=diy")) return "diy";
  if (base === "/boutiques" || base.startsWith("/boutiques/")) return "boutiques";
  if (base === "/faq") return "faq";
  if (base === "/contact") return "contact";
  if (base === "/admin" || base.startsWith("/admin/")) return "admin";

  // Ne jamais traiter /boutique ou /boutique/[slug] comme un onglet générique
  return null;
}

/**
 * Déduit l'onglet depuis les données réelles d'un produit.
 * Ne jamais inventer une catégorie.
 * Priorité e-liquides (volume / type ml) AVANT résistances — évite le faux bleu RÉSISTANCES.
 */
export function navIdFromProduct(product: {
  category?: string | null;
  productType?: string | null;
  productFamily?: string | null;
  categoryRef?: { slug?: string | null; name?: string | null } | null;
  volumeMl?: number | null;
}): MainNavId {
  const catSlug = (product.categoryRef?.slug || product.category || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  // Signal fort format e-liquide (10/20/50/100 ml…) — avant tout autre matching
  const type = (product.productType || "").toLowerCase();
  const vol = product.volumeMl;
  const isLiquidFormat =
    /^\d+\s*ml$/i.test(type) ||
    (typeof vol === "number" && vol > 0 && vol <= 200) ||
    /e-?liquid|liquide/.test(catSlug);

  if (isLiquidFormat || catSlug === "e-liquides" || catSlug.includes("liquid")) {
    return "e-liquides";
  }

  const blob = [
    product.category,
    product.productType,
    product.productFamily,
    product.categoryRef?.slug,
    product.categoryRef?.name,
    product.volumeMl != null ? `${product.volumeMl}ml` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  // Résistances uniquement si catégorie matérielle claire (pas un mot isolé dans un liquide)
  if (
    catSlug === "resistances" ||
    (/^(resist|coil|mesh)/.test(blob) && !/e-?liquid|liquide|\d+\s*ml/.test(blob))
  ) {
    return "resistances";
  }
  if (/\bpod\b/.test(blob) && !/e-?liquid/.test(blob)) return "pods";
  if (/cigarette|e-?cig|box|mod|aio/.test(blob) && !/e-?liquid/.test(blob)) return "e-cigarettes";
  if (/accessoire|drip|coton/.test(blob) && !/e-?liquid/.test(blob)) return "accessoires";
  if (/\bdiy\b|concentre|arome|base\b/.test(blob) && !/e-?liquid|20\s*ml|10\s*ml/.test(blob)) {
    if (/\bdiy\b|concentre|arome/.test(blob)) return "diy";
  }

  return null;
}

/**
 * Retourne UN seul onglet actif.
 * Priorité : contexte produit → route métier explicite → aucun.
 */
export function getActiveMainNavigation(
  pathname: string,
  search = "",
  productContext?: ProductNavContext | null
): MainNavId {
  if (productContext?.navId) return productContext.navId;

  const path = pathname || "/";

  // Routes e-liquides explicites (y compris formats / fabricants / gammes)
  if (
    path === "/e-liquides" ||
    path.startsWith("/e-liquides/") ||
    path.startsWith("/formats/") ||
    path.startsWith("/fabricants/") ||
    path.startsWith("/gammes/")
  ) {
    return "e-liquides";
  }

  // Liste boutique : e-liquides par défaut. Matériel (résistances…) → aucun onglet principal.
  if (path === "/boutique") {
    const params = new URLSearchParams(search);
    const cat = (params.get("category") || "").toLowerCase();
    if (!cat || cat === "e-liquides" || cat.includes("liquid")) return "e-liquides";
    // Ne pas activer RÉSISTANCES / MARQUES ici (catégories non publiées)
    return null;
  }

  // Fiche produit : sans contexte produit, ne jamais activer RÉSISTANCES / MARQUES
  // (évite le double bleu de l'ancienne nav /boutique?category=… + /boutique)
  if (path.startsWith("/boutique/")) {
    return null;
  }

  if (path === "/resistances" || path.startsWith("/resistances/")) return "resistances";
  if (path === "/marques" || path.startsWith("/marques/")) return "marques";
  if (path === "/pods" || path.startsWith("/pods/")) return "pods";
  if (path === "/cigarettes-electroniques" || path.startsWith("/cigarettes-electroniques/"))
    return "e-cigarettes";
  if (path === "/accessoires" || path.startsWith("/accessoires/")) return "accessoires";
  if (path === "/diy" || path.startsWith("/diy/")) return "diy";
  if (path === "/boutiques" || path.startsWith("/boutiques/")) return "boutiques";
  if (path === "/faq" || path.startsWith("/faq/")) return "faq";
  if (path === "/contact" || path.startsWith("/contact/")) return "contact";

  return null;
}

export function isMainNavLinkActive(
  href: string,
  label: string,
  activeId: MainNavId
): boolean {
  if (!activeId) return false;
  const linkId = navIdFromHref(href, label);
  return linkId !== null && linkId === activeId;
}
