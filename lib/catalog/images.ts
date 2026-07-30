import type { ImageStatus } from "@/lib/catalog/types";

export const PLACEHOLDER_PRODUCT_IMAGE = null;

/** Priorité : validated > official > pending > imageUrl legacy */
export function resolveProductImage(params: {
  imageUrl?: string | null;
  imageStatus?: string | null;
  catalogImages?: Array<{ url: string; status: string; sortOrder: number }>;
  legacyImages?: string[];
}): { url: string | null; status: ImageStatus; galerie: string[] } {
  const sorted = [...(params.catalogImages ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const pick = (statuses: ImageStatus[]) =>
    sorted.find((img) => statuses.includes(img.status as ImageStatus))?.url ?? null;

  const primary =
    pick(["validated"]) ??
    pick(["official"]) ??
    pick(["pending"]) ??
    params.imageUrl ??
    null;

  const status: ImageStatus =
    sorted.find((i) => i.url === primary)?.status as ImageStatus ??
    (params.imageStatus as ImageStatus) ??
    (primary ? "official" : "pending");

  const galerie = [
    ...new Set([
      ...sorted.filter((i) => i.status === "validated" || i.status === "official").map((i) => i.url),
      ...(params.legacyImages ?? []),
      ...(primary ? [primary] : []),
    ]),
  ].filter(Boolean) as string[];

  return { url: primary, status, galerie };
}

export function isGroupPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /group|rayon|selection|hero|banner|collection/i.test(url);
}

/** Rejette les photos de groupe — cartes = bouteille seule uniquement */
export function filterSingleBottleImages(urls: string[]): string[] {
  return urls.filter((u) => !isGroupPhotoUrl(u));
}
