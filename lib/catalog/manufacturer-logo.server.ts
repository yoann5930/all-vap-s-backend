/**
 * Vérification disque des logos — serveur uniquement.
 */
import fs from "node:fs";
import path from "node:path";
import { manufacturerLogoCandidates } from "@/lib/catalog/manufacturer-logo";

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
