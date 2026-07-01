export interface NavLink {
  href: string;
  label: string;
}

export const mainNavLinks: NavLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/boutique", label: "Boutique" },
  { href: "/e-liquides", label: "E-liquides" },
  { href: "/pods", label: "Pods" },
  { href: "/diy", label: "DIY" },
  { href: "/accessoires", label: "Accessoires" },
  { href: "/promotions", label: "Promotions" },
  { href: "/boutiques", label: "Nos boutiques" },
  { href: "/contact", label: "Contact" },
];

export const footerNavLinks: NavLink[] = [
  { href: "/", label: "Accueil" },
  { href: "/boutique", label: "Boutique" },
  { href: "/e-liquides", label: "E-liquides" },
  { href: "/pods", label: "Pods" },
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
  { href: "https://www.facebook.com/allvaps", label: "Facebook", icon: "facebook" as const },
  { href: "https://www.instagram.com/allvaps", label: "Instagram", icon: "instagram" as const },
];
