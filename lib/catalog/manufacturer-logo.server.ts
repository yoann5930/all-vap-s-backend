/**
 * Vérification disque des logos / bannières — serveur uniquement.
 */
import fs from "node:fs";
import path from "node:path";
import {
  manufacturerBannerUrl,
  manufacturerLogoCandidates,
} from "@/lib/catalog/manufacturer-logo";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

export function manufacturerLogoUrlIfExists(
  slug: string | null | undefined
): string | null {
  if (!slug) return null;
  for (const rel of manufacturerLogoCandidates(slug)) {
    const abs = path.join(PUBLIC_ROOT, rel.replace(/^\//, ""));
    if (fs.existsSync(abs)) return rel;
  }
  return null;
}

/** Affichable sur /e-liquides si logo officiel OU bannière générée existe. */
export function manufacturerBannerOrLogoIfExists(
  slug: string | null | undefined
): string | null {
  if (!slug) return null;
  const banner = manufacturerBannerUrl(slug);
  if (banner) {
    const abs = path.join(PUBLIC_ROOT, banner.replace(/^\//, ""));
    if (fs.existsSync(abs)) return banner;
  }
  return manufacturerLogoUrlIfExists(slug);
}
