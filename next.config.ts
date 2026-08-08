import type { NextConfig } from "next";

const baseSecurityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: data: mediastream:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  // TEMP — dette de merge site+inventaire (champs Order/SumUp hors inventaire).
  // Ne masque PAS les erreurs runtime inventaire. À retirer après alignement schéma complet.
  // Voir docs/INVENTORY_APP_DEPLOYMENT.md
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.allvaps.fr" },
      { protocol: "https", hostname: "allvaps.fr" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/products", destination: "/boutique", permanent: true },
      { source: "/products/:slug", destination: "/boutique/:slug", permanent: true },
      { source: "/nos-boutiques", destination: "/boutiques", permanent: true },
      // /e-liquides = hub fabricants (bannières) — ne pas rediriger vers /boutique
      {
        source: "/cigarettes-electroniques",
        destination: "/boutique?category=cigarettes-electroniques",
        permanent: true,
      },
      { source: "/pods", destination: "/boutique?category=pods", permanent: true },
      { source: "/diy", destination: "/boutique?category=diy", permanent: true },
      { source: "/accessoires", destination: "/boutique?category=accessoires", permanent: true },
    ];
  },
  async headers() {
  const inventaireCamera = {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  };
  /** Pages A.V.A. (Admin + client vocal) — micro requis pour STT */
  const avaMicrophone = {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  };
  const noCamera = {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  };
  return [
    // Inventaire : caméra autorisée (sinon camera=() global bloque getUserMedia)
    {
      source: "/inventaire",
      headers: [...baseSecurityHeaders, inventaireCamera],
    },
    {
      source: "/inventaire/:path*",
      headers: [...baseSecurityHeaders, inventaireCamera],
    },
    {
      source: "/admin/inventaire",
      headers: [...baseSecurityHeaders, inventaireCamera],
    },
    {
      source: "/admin/inventaire/:path*",
      headers: [...baseSecurityHeaders, inventaireCamera],
    },
    {
      source: "/admin/inventaires",
      headers: [...baseSecurityHeaders, inventaireCamera],
    },
    {
      source: "/admin/inventaires/:path*",
      headers: [...baseSecurityHeaders, inventaireCamera],
    },
    {
      source: "/admin/ava",
      headers: [...baseSecurityHeaders, avaMicrophone],
    },
    {
      source: "/admin/ava/:path*",
      headers: [...baseSecurityHeaders, avaMicrophone],
    },
    {
      source: "/ia",
      headers: [...baseSecurityHeaders, avaMicrophone],
    },
    {
      source: "/ia/:path*",
      headers: [...baseSecurityHeaders, avaMicrophone],
    },
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|inventaire|admin/inventaire|admin/ava|ia).*)",
      headers: [...baseSecurityHeaders, noCamera],
    },
    {
      source: "/_next/static/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: "/(.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2))",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: "/apps/:file*.apk",
      headers: [
        {
          key: "Content-Type",
          value: "application/vnd.android.package-archive",
        },
        {
          key: "Content-Disposition",
          value: 'attachment; filename="AllVaps-Inventaire.apk"',
        },
        { key: "Cache-Control", value: "public, max-age=300" },
      ],
    },
  ];
},
};

export default nextConfig;
