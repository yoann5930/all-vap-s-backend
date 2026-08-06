import fs from "node:fs";
import path from "node:path";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

/**
 * Visuel officiel de gamme (case catalogue niveau 2).
 * Convention disque : public/media/manufacturers/{fabricant}/ranges/{gamme}.webp
 */
export function rangeCoverUrl(
  manufacturerSlug: string | null | undefined,
  rangeSlug: string | null | undefined
): string | null {
  if (!manufacturerSlug || !rangeSlug) return null;
  const candidates = [
    `/media/manufacturers/${manufacturerSlug}/ranges/${rangeSlug}.webp`,
    `/media/manufacturers/${manufacturerSlug}/ranges/${rangeSlug}.jpg`,
    `/media/manufacturers/${manufacturerSlug}/ranges/${rangeSlug}.png`,
  ];
  for (const rel of candidates) {
    const abs = path.join(PUBLIC_ROOT, rel.replace(/^\//, ""));
    if (fs.existsSync(abs)) return rel;
  }
  return null;
}
