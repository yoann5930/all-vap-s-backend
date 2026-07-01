import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/utils";
import prisma from "@/lib/prisma";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/account/", "/checkout/", "/cart", "/compte/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base.replace(/^https?:\/\//, "").replace(/^www\./, ""),
  };
}
