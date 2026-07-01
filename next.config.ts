import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ["image/webp", "image/avif"],
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      { source: "/products", destination: "/boutique", permanent: true },
      { source: "/products/:slug", destination: "/boutique/:slug", permanent: true },
      { source: "/nos-boutiques", destination: "/boutiques", permanent: true },
      { source: "/e-liquides", destination: "/boutique?category=e-liquides", permanent: true },
      { source: "/cigarettes-electroniques", destination: "/boutique?category=cigarettes-electroniques", permanent: true },
      { source: "/pods", destination: "/boutique?category=pods", permanent: true },
      { source: "/diy", destination: "/boutique?category=diy", permanent: true },
      { source: "/accessoires", destination: "/boutique?category=accessoires", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/(.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
