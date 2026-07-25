/** Configuration SEO officielle — domaine de production All Vap's */
function resolveSiteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv;
  }
  // Canonique public (le site live répond sur www)
  return "https://www.allvaps.fr";
}

export const SITE_URL = resolveSiteUrl();
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

export const OG_IMAGE = "/brand/og-image.png";
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
