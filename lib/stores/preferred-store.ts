/**
 * Mémorise uniquement l'id boutique (hautmont | le-quesnoy).
 * Jamais de coordonnées GPS.
 */

const KEY = "allvaps_preferred_store";

export type PreferredStoreId = "hautmont" | "le-quesnoy";

export function getPreferredStoreId(): PreferredStoreId | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    if (v === "hautmont" || v === "le-quesnoy") return v;
    return null;
  } catch {
    return null;
  }
}

export function setPreferredStoreId(id: PreferredStoreId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, id);
    window.dispatchEvent(new CustomEvent("allvaps:preferred-store", { detail: { id } }));
  } catch {
    /* ignore */
  }
}

export function clearPreferredStoreId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("allvaps:preferred-store", { detail: { id: null } }));
  } catch {
    /* ignore */
  }
}
