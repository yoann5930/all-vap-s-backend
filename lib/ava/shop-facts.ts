/**
 * Coordonnées boutiques pour AVA (ava-main).
 * Adresses / horaires = lib/stores (site). Téléphones / email = officiels demandés.
 * Ne pas inventer d'autres adresses.
 */
import { stores } from "@/lib/stores";
import { getShopClock, speakShopOpenClosed, type ShopClock } from "@/lib/ava/shop-clock";

export const AVA_PUBLIC_EMAIL = "contact@allvaps.fr";

/** Numéros officiels transmis pour AVA — distincts des 03 27 encore dans stores.ts. */
export const AVA_OFFICIAL_PHONES = {
  hautmont: "09 55 80 75 22",
  leQuesnoy: "09 50 12 80 45",
} as const;

export const AVA_LOYALTY_NOT_WIRED =
  "Le programme fidélité n'est pas encore branché sur le site. Tu peux commander sans compte fidélité. En boutique, Fidelatoo reste disponible.";

export function speakAllVapsShops(clock: ShopClock = getShopClock()): string {
  const status = speakShopOpenClosed(clock);
  const hautmont = stores.find((s) => s.id === "hautmont");
  const quesnoy = stores.find((s) => s.id === "le-quesnoy");
  if (!hautmont || !quesnoy) {
    return `${status} On a deux boutiques à Hautmont et au Quesnoy.`;
  }
  return (
    `${status} ` +
    `Nous avons une boutique à ${hautmont.city}, ${hautmont.address}, ${hautmont.postalCode}. ` +
    `Téléphone : ${AVA_OFFICIAL_PHONES.hautmont}. ` +
    `Nous avons également une boutique au Quesnoy, ${quesnoy.address}, ${quesnoy.postalCode}. ` +
    `Téléphone : ${AVA_OFFICIAL_PHONES.leQuesnoy}. ` +
    `Email : ${AVA_PUBLIC_EMAIL}.`
  );
}
