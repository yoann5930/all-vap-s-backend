/**
 * Coordonnées boutiques pour AVA (ava-main).
 * Adresses / horaires = lib/stores (site). Téléphones / email = officiels demandés.
 * Ne pas inventer d'autres adresses.
 */
import { stores } from "@/lib/stores";

export const AVA_PUBLIC_EMAIL = "contact@allvaps.fr";

/** Numéros officiels transmis pour AVA — distincts des 03 27 encore dans stores.ts. */
export const AVA_OFFICIAL_PHONES = {
  hautmont: "09 55 80 75 22",
  leQuesnoy: "09 50 12 80 45",
} as const;

export const AVA_LOYALTY_NOT_WIRED =
  "Le programme fidélité n'est pas encore branché sur le site. Tu peux commander sans compte fidélité. En boutique, Fidelatoo reste disponible.";

export function speakAllVapsShops(): string {
  const hautmont = stores.find((s) => s.id === "hautmont");
  const quesnoy = stores.find((s) => s.id === "le-quesnoy");
  if (!hautmont || !quesnoy) {
    return "On a deux boutiques à Hautmont et au Quesnoy, lundi à samedi de 10h à 19h.";
  }
  return (
    `On a deux boutiques. ${hautmont.name}, ${hautmont.address}, ${hautmont.postalCode} ${hautmont.city}, ` +
    `téléphone ${AVA_OFFICIAL_PHONES.hautmont}. ${hautmont.hours[0]}. ` +
    `${quesnoy.name}, ${quesnoy.address}, ${quesnoy.postalCode} ${quesnoy.city}, ` +
    `téléphone ${AVA_OFFICIAL_PHONES.leQuesnoy}. ${quesnoy.hours[0]}. ` +
    `Email : ${AVA_PUBLIC_EMAIL}.`
  );
}
