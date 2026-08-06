import { stores, type Store, getStoreById } from "@/lib/stores";

export type NearestStoreResult = {
  store: Store;
  distanceKm: number;
  /** Estimation grossière voiture ~45 km/h — indicatif uniquement */
  driveMinutesApprox: number | null;
  otherStore: Store;
};

/** Formate un téléphone E.164 FR pour l'affichage (ex. +33327496100 → 03 27 49 61 00). */
export function formatStorePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("33") && national.length >= 11) {
    national = `0${national.slice(2)}`;
  }
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

/** Distance Haversine en km (Earth radius 6371). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestStore(lat: number, lng: number): NearestStoreResult {
  const ranked = stores
    .map((store) => ({
      store,
      distanceKm: haversineKm(lat, lng, store.lat, store.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = ranked[0];
  const other = ranked[1]?.store || ranked[0].store;
  const driveMinutesApprox =
    nearest.distanceKm > 0
      ? Math.max(5, Math.round((nearest.distanceKm / 45) * 60))
      : null;

  return {
    store: nearest.store,
    distanceKm: Math.round(nearest.distanceKm * 10) / 10,
    driveMinutesApprox,
    otherStore: other,
  };
}

export function googleMapsDirectionsUrl(store: Store): string {
  const dest = encodeURIComponent(
    `${store.address}, ${store.postalCode} ${store.city}`
  );
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function wazeNavigateUrl(store: Store): string {
  const q = encodeURIComponent(
    `${store.address}, ${store.postalCode} ${store.city}`
  );
  return `https://waze.com/ul?q=${q}&navigate=yes`;
}

export function telHref(store: Store): string {
  return `tel:${store.phone}`;
}

export function formatDistanceLabel(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export { getStoreById, stores };
export type { Store };
