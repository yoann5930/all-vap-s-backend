import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { searchStoreByCityOrPostal } from "@/lib/stores/geocode-fr";
import {
  formatDistanceLabel,
  formatStorePhone,
  googleMapsDirectionsUrl,
  wazeNavigateUrl,
  telHref,
} from "@/lib/stores/nearest";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  query: z.string().min(2).max(120),
});

/**
 * Recherche manuelle ville / CP → boutique la plus proche.
 * Ne reçoit / ne journalise aucune coordonnée GPS.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`store-search:${ip}`, 20, 60_000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de recherches. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const { query } = schema.parse(await request.json());
    const found = await searchStoreByCityOrPostal(query);
    if (!found.ok) {
      return jsonResponse({ ok: false, message: found.message }, 404);
    }

    const { result } = found;
    const s = result.store;
    return jsonResponse({
      ok: true,
      storeId: s.id,
      name: s.name,
      address: s.address,
      postalCode: s.postalCode,
      city: s.city,
      phoneDisplay: formatStorePhone(s.phone),
      phoneHref: telHref(s),
      hours: s.hours,
      distanceKm: result.distanceKm,
      distanceLabel: formatDistanceLabel(result.distanceKm),
      driveMinutesApprox: result.driveMinutesApprox,
      googleMapsUrl: googleMapsDirectionsUrl(s),
      wazeUrl: wazeNavigateUrl(s),
      otherStore: {
        id: result.otherStore.id,
        name: result.otherStore.name,
        phoneDisplay: formatStorePhone(result.otherStore.phone),
        phoneHref: telHref(result.otherStore),
        googleMapsUrl: googleMapsDirectionsUrl(result.otherStore),
        wazeUrl: wazeNavigateUrl(result.otherStore),
        address: result.otherStore.address,
        postalCode: result.otherStore.postalCode,
        city: result.otherStore.city,
        hours: result.otherStore.hours,
      },
      privacy:
        "Votre position est utilisée uniquement pour identifier la boutique la plus proche. Elle n'est ni enregistrée ni partagée.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
