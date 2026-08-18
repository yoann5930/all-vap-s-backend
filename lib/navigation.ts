/**
 * Navigation publique — uniquement ce qui est prêt.
 * Catégories incomplètes masquées (restent en admin).
 */
export interface NavLink {
  href: string;
  label: string;
}

/** Nav principale publique : e-liquides seulement tant que le reste n'est pas validé */
export const mainNavLinks: NavLink[] = [
  { href: "/e-liquides", label: "E-LIQUIDES" },
  { href: "/boutiques", label: "BOUTIQUES" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "CONTACT" },
];

/** Catégories masquées du public (présentes côté admin / futures) */
export const hiddenPublicCategories = [
  "cigarettes-electroniques",
  "pods",
  "resistances",
  "accessoires",
  "diy",
  "accus",
  "chargeurs",
  "drip-tips",
  "promotions",
  "nouveautes",
] as const;

export const footerNavLinks: NavLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/e-liquides", label: "E-liquides" },
  { href: "/boutiques", label: "Nos boutiques" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export const footerLegalLinks: NavLink[] = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/cgv", label: "CGV" },
  { href: "/politique-confidentialite", label: "Politique de confidentialité" },
];

export const socialLinks = [
  { href: "https://www.facebook.com/profile.php?id=61554838700955", label: "Facebook", icon: "facebook" as const },
  { href: "https://www.instagram.com/allvaps", label: "Instagram", icon: "instagram" as const },
];

export {
  getActiveMainNavigation,
  isMainNavLinkActive,
  navIdFromHref,
  navIdFromProduct,
} from "@/lib/navigation/active-main-nav";
export type { MainNavId, ProductNavContext } from "@/lib/navigation/active-main-nav";
