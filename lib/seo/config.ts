/** Configuration SEO officielle — https://allvaps.fr */
export const SITE_URL = "https://allvaps.fr";
export const SITE_NAME = "All Vap's";
export const SITE_LOCALE = "fr_FR";

export const DEFAULT_TITLE =
  "All Vap's | Cigarettes électroniques • E-liquides • Hautmont • Le Quesnoy";

export const DEFAULT_DESCRIPTION =
  "Découvrez All Vap's, spécialiste de la cigarette électronique à Hautmont et Le Quesnoy. E-liquides, cigarettes électroniques, pods, DIY, accessoires, conseils personnalisés et livraison rapide.";

export const SEO_KEYWORDS = [
  "all vaps",
  "allvaps",
  "cigarette électronique hautmont",
  "cigarette électronique le quesnoy",
  "vape hautmont",
  "vape le quesnoy",
  "e liquide hautmont",
  "e liquide le quesnoy",
  "vapoteuse",
  "ecigarette nord",
  "vape nord",
  "boutique vape",
  "magasin cigarette électronique",
  "cigarette électronique",
  "e-liquide",
  "pods",
  "DIY",
  "accessoires vape",
];

export const OG_IMAGE = "/og-image.svg";
export const TWITTER_HANDLE = "@allvaps";

export const CATEGORY_ROUTES: Record<string, string> = {
  "/e-liquides": "e-liquides",
  "/cigarettes-electroniques": "cigarettes-electroniques",
  "/pods": "pods",
  "/diy": "diy",
  "/accessoires": "accessoires",
};

export function absoluteUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean}`;
}
