import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  // DENY bloque le Simple Browser / preview IDE → page blanche en local
  ...(isDev ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      `frame-ancestors ${isDev ? "*" : "'none'"}`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
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
      // Ancienne URL produit → fiche réelle (jamais le hub e-liquides)
      { source: "/products", destination: "/e-liquides", permanent: false },
      { source: "/products/:slug", destination: "/boutique/:slug", permanent: false },
      // /boutique reste la grille catalogue (recherche ?search=, filtres). /e-liquides = hub.
      { source: "/nos-boutiques", destination: "/boutiques", permanent: true },
      // Catégories / nav non prêtes → page d'attente (pas de faux catalogue)
      { source: "/cigarettes-electroniques", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/pods", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/accessoires", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/diy", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/promotions", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/nouveautes", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/meilleures-ventes", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/resistances", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/marques", destination: "/catalogue-en-preparation", permanent: false },
      { source: "/marques/:slug", destination: "/catalogue-en-preparation", permanent: false },
      // Ancienne nav : /boutique?category=… matériel
      {
        source: "/boutique",
        has: [{ type: "query", key: "category", value: "resistances" }],
        destination: "/catalogue-en-preparation",
        permanent: false,
      },
      {
        source: "/boutique",
        has: [{ type: "query", key: "category", value: "cigarettes-electroniques" }],
        destination: "/catalogue-en-preparation",
        permanent: false,
      },
      {
        source: "/boutique",
        has: [{ type: "query", key: "category", value: "pods" }],
        destination: "/catalogue-en-preparation",
        permanent: false,
      },
      {
        source: "/boutique",
        has: [{ type: "query", key: "category", value: "marques" }],
        destination: "/catalogue-en-preparation",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
        headers: securityHeaders,
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/(.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
