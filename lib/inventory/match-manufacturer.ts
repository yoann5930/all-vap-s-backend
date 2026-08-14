import { normalizeProductName } from "@/lib/catalog/normalize";
import {
  excludeRangesFromManufacturers,
  isNonexistentBrandName,
  isRangeNotManufacturerName,
} from "@/lib/catalog/ranges-not-manufacturers";

export type ManufacturerOption = { id: string; name: string; slug: string };

function norm(raw: string): string {
  return normalizeProductName(raw);
}

function usableManufacturers(manufacturers: ManufacturerOption[]): ManufacturerOption[] {
  return excludeRangesFromManufacturers(manufacturers).filter(
    (m) => !isRangeNotManufacturerName(m.name) && !isNonexistentBrandName(m.name)
  );
}

/** Associe une saisie / suggestion à un fabricant du site. N’invente rien. */
export function matchManufacturerName(
  raw: string | null | undefined,
  manufacturers: ManufacturerOption[]
): string | null {
  if (isRangeNotManufacturerName(raw) || isNonexistentBrandName(raw)) return null;
  const q = norm(raw || "");
  if (!q || manufacturers.length === 0) return null;
  const list = usableManufacturers(manufacturers);
  const exact = list.find((m) => norm(m.name) === q);
  if (exact) return exact.name;
  const hits = list
    .filter((m) => {
      const n = norm(m.name);
      if (n.length < 3) return false;
      return q.includes(n) || n.includes(q);
    })
    .sort((a, b) => norm(b.name).length - norm(a.name).length);
  const hit = hits[0]?.name || null;
  if (hit && (isRangeNotManufacturerName(hit) || isNonexistentBrandName(hit))) return null;
  return hit;
}

/** Si le nom produit contient un fabricant du site, le proposer. */
export function guessManufacturerFromProductName(
  productName: string | null | undefined,
  manufacturers: ManufacturerOption[]
): string | null {
  const q = norm(productName || "");
  if (!q) return null;
  const hits = usableManufacturers(manufacturers)
    .filter((m) => {
      const n = norm(m.name);
      return n.length >= 3 && q.includes(n);
    })
    .sort((a, b) => norm(b.name).length - norm(a.name).length);
  const hit = hits[0]?.name || null;
  if (hit && (isRangeNotManufacturerName(hit) || isNonexistentBrandName(hit))) return null;
  return hit;
}
