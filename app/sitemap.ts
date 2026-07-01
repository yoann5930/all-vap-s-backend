import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/utils";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";
import { stores } from "@/lib/stores";
import prisma from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/boutique`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${base}/promotions`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/nouveautes`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/meilleures-ventes`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/boutiques`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.75 },
    { url: `${base}/ia`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/cgv`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/mentions-legales`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/politique-confidentialite`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const categoryPages: MetadataRoute.Sitemap = CATALOG_CATEGORIES.map((c) => ({
    url: `${base}/boutique?category=${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const cleanCategoryUrls: MetadataRoute.Sitemap = [
    "/e-liquides",
    "/cigarettes-electroniques",
    "/pods",
    "/diy",
    "/accessoires",
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.82,
  }));

  const storePages: MetadataRoute.Sitemap = stores.map((s) => ({
    url: `${base}/boutiques/${s.id}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.88,
  }));

  let productPages: MetadataRoute.Sitemap = [];
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    });
    productPages = products.map((p) => ({
      url: `${base}/boutique/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // mode démo ou BDD indisponible
  }

  return [...staticPages, ...cleanCategoryUrls, ...categoryPages, ...storePages, ...productPages];
}
