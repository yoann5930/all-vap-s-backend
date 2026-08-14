import { normalizeProductName } from "@/lib/catalog/normalize";

export type ManufacturerOption = { id: string; name: string; slug: string };

function norm(raw: string): string {
  return normalizeProductName(raw);
}

/** Associe une saisie / suggestion à un fabricant du site. N’invente rien. */
export function matchManufacturerName(
  raw: string | null | undefined,
  manufacturers: ManufacturerOption[]
): string | null {
  const q = norm(raw || "");
  if (!q || manufacturers.length === 0) return null;
  const exact = manufacturers.find((m) => norm(m.name) === q);
  if (exact) return exact.name;
  const hits = manufacturers
    .filter((m) => {
      const n = norm(m.name);
      if (n.length < 3) return false;
      return q.includes(n) || n.includes(q);
    })
    .sort((a, b) => norm(b.name).length - norm(a.name).length);
  return hits[0]?.name || null;
}

/** Si le nom produit contient un fabricant du site, le proposer. */
export function guessManufacturerFromProductName(
  productName: string | null | undefined,
  manufacturers: ManufacturerOption[]
): string | null {
  const q = norm(productName || "");
  if (!q) return null;
  const hits = manufacturers
    .filter((m) => {
      const n = norm(m.name);
      return n.length >= 3 && q.includes(n);
    })
    .sort((a, b) => norm(b.name).length - norm(a.name).length);
  return hits[0]?.name || null;
}
