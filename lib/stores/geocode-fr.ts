/**
 * Recherche manuelle ville / code postal → boutique la plus proche.
 * Aucune coordonnée GPS client n'est stockée.
 * Lookup local pour le bassin Hautmont / Le Quesnoy + fallback Nominatim (FR).
 */

import { findNearestStore, type NearestStoreResult } from "./nearest";

/** Codes postaux / villes connues du bassin (source locale, pas de GPS client). */
const LOCAL_HINTS: Array<{
  match: RegExp;
  /** Point approximatif de la commune pour Haversine (pas une position utilisateur) */
  lat: number;
  lng: number;
}> = [
  { match: /^59330$|hautmont/i, lat: 50.2508, lng: 3.9217 },
  { match: /^59530$|quesnoy/i, lat: 50.2488, lng: 3.6365 },
  { match: /^59600$|maubeuge/i, lat: 50.2775, lng: 3.972 },
  { match: /^59440$|avesnes|avesnes-sur-helpe/i, lat: 50.123, lng: 3.932 },
  { match: /^59132$|ferriere|ferrière/i, lat: 50.245, lng: 3.99 },
  { match: /^59540$|caudry/i, lat: 50.125, lng: 3.412 },
  { match: /^59216$|sains|sains-du-nord/i, lat: 50.093, lng: 4.0 },
  { match: /^59163$|cond[eé]|conde-sur-l'?escaut/i, lat: 50.45, lng: 3.59 },
  { match: /^59220$|denain/i, lat: 50.328, lng: 3.395 },
  { match: /^59300$|valenciennes/i, lat: 50.357, lng: 3.523 },
  { match: /^59460$|jeumont/i, lat: 50.296, lng: 4.1 },
  { match: /^59740$|solre/i, lat: 50.18, lng: 4.08 },
  { match: /^59144$|gommegnies/i, lat: 50.27, lng: 3.64 },
  { match: /^59570$|bavay/i, lat: 50.298, lng: 3.794 },
  { match: /^59219$|landrecies/i, lat: 50.125, lng: 3.69 },
];

function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type ManualSearchResult =
  | { ok: true; result: NearestStoreResult; method: "local" | "nominatim" }
  | { ok: false; message: string };

export async function searchStoreByCityOrPostal(
  query: string
): Promise<ManualSearchResult> {
  const raw = (query || "").trim();
  if (raw.length < 2) {
    return { ok: false, message: "Indiquez une ville ou un code postal." };
  }

  const norm = normalizeQuery(raw);
  const postal = raw.match(/\b(\d{5})\b/)?.[1];

  for (const hint of LOCAL_HINTS) {
    if ((postal && hint.match.test(postal)) || hint.match.test(norm) || hint.match.test(raw)) {
      // Haversine depuis le centre commune (jamais une position GPS client).
      return { ok: true, method: "local", result: findNearestStore(hint.lat, hint.lng) };
    }
  }

  // Fallback Nominatim (France uniquement) — lat/lng utilisés en mémoire, jamais loggés
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${raw}, France`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "fr");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "AllVapsStoreFinder/1.0 (contact@allvaps.fr)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        ok: false,
        message:
          "Ville ou code postal non reconnu. Essayez Hautmont, Le Quesnoy, ou un code postal du Nord.",
      };
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data?.[0]) {
      return {
        ok: false,
        message:
          "Ville ou code postal non reconnu. Essayez Hautmont, Le Quesnoy, ou un code postal du Nord.",
      };
    }
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, message: "Impossible de localiser cette recherche." };
    }
    return { ok: true, method: "nominatim", result: findNearestStore(lat, lng) };
  } catch {
    return {
      ok: false,
      message:
        "Recherche indisponible pour le moment. Essayez Hautmont (59330) ou Le Quesnoy (59530).",
    };
  }
}
