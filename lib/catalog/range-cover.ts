import fs from "node:fs";
import path from "node:path";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

/**
 * Visuel officiel de gamme (case catalogue niveau 2).
 * Convention disque : public/media/manufacturers/{fabricant}/ranges/{gamme}.webp
 * Variante historique acceptée : {gamme}-{fabricant}.webp
 */
export function rangeCoverUrl(
  manufacturerSlug: string | null | undefined,
  rangeSlug: string | null | undefined
): string | null {
  if (!manufacturerSlug || !rangeSlug) return null;
  const bases = [rangeSlug];
  const suffixed = `${rangeSlug}-${manufacturerSlug}`;
  if (!rangeSlug.endsWith(`-${manufacturerSlug}`)) bases.push(suffixed);
  // Si le slug DB est déjà « gamme-fabricant », tenter aussi le slug court
  if (rangeSlug.endsWith(`-${manufacturerSlug}`)) {
    const short = rangeSlug.slice(0, -(manufacturerSlug.length + 1));
    if (short) bases.push(short);
  }
  const exts = ["webp", "jpg", "jpeg", "png"] as const;
  for (const base of bases) {
    for (const ext of exts) {
      const rel = `/media/manufacturers/${manufacturerSlug}/ranges/${base}.${ext}`;
      const abs = path.join(PUBLIC_ROOT, rel.replace(/^\//, ""));
      if (fs.existsSync(abs)) return rel;
    }
  }
  return null;
}
