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
  photos: string[];
  googleReviews: GoogleReview[];
}

export const stores: Store[] = [
  {
    id: "hautmont",
    name: "All Vap's Hautmont",
    address: "17 Avenue Marcel Aimé",
    city: "Hautmont",
    postalCode: "59330",
    phone: "+33327496100",
    email: "hautmont@allvaps.fr",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=17+Avenue+Marcel+Aim%C3%A9,+59330+Hautmont",
    embedMapUrl:
      "https://maps.google.com/maps?q=17+Avenue+Marcel+Aimé,+59330+Hautmont&output=embed",
    googleMapsPlaceUrl:
      "https://www.google.com/maps/search/?api=1&query=All+Vap's+Hautmont",
    lat: 50.2508,
    lng: 3.9217,
    hours: ["Lundi – Samedi : 10h – 19h", "Dimanche : Fermé"],
    googleReviews: [
      { author: "Marc D.", rating: 5, text: "Excellent accueil et très bons conseils pour débuter la vape.", date: "2025-11-12" },
      { author: "Sophie L.", rating: 5, text: "Large choix d'e-liquides et équipe très professionnelle.", date: "2025-10-03" },
      { author: "Julien P.", rating: 4, text: "Boutique bien achalandée, retrait commande rapide.", date: "2025-09-18" },
    ],
    photos: [
      "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=800&q=80",
      "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    ],
  },
  {
    id: "le-quesnoy",
    name: "All Vap's Le Quesnoy",
    address: "10 Rue Léon Gambetta",
    city: "Le Quesnoy",
    postalCode: "59530",
    phone: "+33327496200",
    email: "quesnoy@allvaps.fr",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=10+Rue+L%C3%A9on+Gambetta,+59530+Le+Quesnoy",
    embedMapUrl:
      "https://maps.google.com/maps?q=10+Rue+Léon+Gambetta,+59530+Le+Quesnoy&output=embed",
    googleMapsPlaceUrl:
      "https://www.google.com/maps/search/?api=1&query=All+Vap's+Le+Quesnoy",
    lat: 50.2488,
    lng: 3.6365,
    hours: ["Lundi – Samedi : 10h – 19h", "Dimanche : Fermé"],
    googleReviews: [
      { author: "Claire M.", rating: 5, text: "Magasin au top, conseils personnalisés et produits de qualité.", date: "2025-11-20" },
      { author: "Thomas R.", rating: 5, text: "Toujours de bons conseils et un excellent rapport qualité-prix.", date: "2025-08-07" },
      { author: "Émilie B.", rating: 4, text: "Belle boutique, personnel à l'écoute.", date: "2025-07-15" },
    ],
    photos: [
      "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=800&q=80",
      "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=800&q=80",
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&q=80",
    ],
  },
];

export function getStoreById(id: string): Store | undefined {
  return stores.find((s) => s.id === id);
}
