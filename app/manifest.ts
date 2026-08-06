import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/seo/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "All Vap's",
    description:
      "Spécialiste cigarette électronique à Hautmont et Le Quesnoy — e-liquides, pods, DIY et accessoires.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05070A",
    theme_color: "#05070A",
    lang: "fr",
    categories: ["shopping", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
