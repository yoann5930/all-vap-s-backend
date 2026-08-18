export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  date: string;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  phone: string;
  email: string;
  mapsUrl: string;
  embedMapUrl: string;
  googleMapsPlaceUrl: string;
  lat: number;
  lng: number;
  hours: string[];
  /** Photos boutique — vides tant que les médias officiels ne sont pas fournis. */
  photos: string[];
  /** Avis Google — uniquement via API Places réelle ; jamais inventés. */
  googleReviews: GoogleReview[];
}

export const stores: Store[] = [
  {
    id: "hautmont",
    name: "All Vap's Hautmont",
    address: "17 Avenue Marcel Aimé",
    city: "Hautmont",
    postalCode: "59330",
    phone: "+33955807522",
    email: "contact@allvaps.fr",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=17+Avenue+Marcel+Aim%C3%A9,+59330+Hautmont",
    embedMapUrl:
      "https://maps.google.com/maps?q=17+Avenue+Marcel+Aimé,+59330+Hautmont&output=embed",
    googleMapsPlaceUrl:
      "https://www.google.com/maps/search/?api=1&query=All+Vap's+Hautmont",
    lat: 50.2508,
    lng: 3.9217,
    hours: ["Lundi – Samedi : 10h – 19h", "Dimanche : Fermé"],
    googleReviews: [],
    photos: [],
  },
  {
    id: "le-quesnoy",
    name: "All Vap's Le Quesnoy",
    address: "10 Rue Léon Gambetta",
    city: "Le Quesnoy",
    postalCode: "59530",
    phone: "+33950128045",
    email: "contact@allvaps.fr",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=10+Rue+L%C3%A9on+Gambetta,+59530+Le+Quesnoy",
    embedMapUrl:
      "https://maps.google.com/maps?q=10+Rue+Léon+Gambetta,+59530+Le+Quesnoy&output=embed",
    googleMapsPlaceUrl:
      "https://www.google.com/maps/search/?api=1&query=All+Vap's+Le+Quesnoy",
    lat: 50.2488,
    lng: 3.6365,
    hours: ["Lundi – Samedi : 10h – 19h", "Dimanche : Fermé"],
    googleReviews: [],
    photos: [],
  },
];

export function getStoreById(id: string): Store | undefined {
  return stores.find((s) => s.id === id);
}
