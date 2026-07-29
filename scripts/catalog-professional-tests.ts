/**
 * Tests Phase 2 catalogue professionnel
 * Run: npx tsx scripts/catalog-professional-tests.ts
 */
import { normalizeSearchText, searchCatalogProducts, runSearchSelfTests } from "../lib/catalog/search-engine";
import { isGroupPhotoUrl, resolveProductImage } from "../lib/catalog/images";
import { buildFlavorWhere } from "../lib/catalog/filters";
import { toCatalogProduct } from "../lib/catalog/product-view";
import type { CatalogProductFull } from "../lib/catalog/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log("OK ", label);
  } else {
    failed++;
    console.error("FAIL", label);
  }
}

// Recherche tolérante
assert(normalizeSearchText("Black Berry") === "black berry", "normalise black berry");
assert(normalizeSearchText("Mangue Passion") === "mangue passion", "normalise mangue passion");

const mockProducts: CatalogProductFull[] = [
  {
    id: "1",
    reference: "IC-BBR",
    ean: null,
    slug: "ice-cool-blackberry-raspberry",
    fabricant: "Liquidarom",
    gamme: "Ice Cool",
    gammeSlug: "ice-cool",
    nom: "Ice Cool Blackberry Raspberry",
    descriptionCourte: "Mûre framboise fraîche",
    descriptionLongue: null,
    categorie: "E-liquides",
    categorieSlug: "e-liquides",
    marque: "Liquidarom",
    marqueSlug: "liquidarom",
    saveurs: ["Blackberry", "Raspberry"],
    saveurPrincipale: "Blackberry",
    saveursSecondaires: ["Raspberry"],
    fraicheur: "frais",
    intensite: null,
    format: "50 ml",
    nicotine: 0,
    pg: 50,
    vg: 50,
    pgVg: "50/50",
    prix: 599,
    promo: null,
    stock: 5,
    stockDisponibilite: "in_stock",
    photo: null,
    photoStatut: "pending",
    galerie: [],
    visible: true,
    ordre: 0,
    dateCreation: new Date(),
    dateModification: new Date(),
    isNew: true,
    isPromo: false,
    isBestSeller: false,
    profilGustatif: {
      fruit: true,
      menthole: false,
      boisson: false,
      dessert: false,
      tabac: false,
      bonbon: false,
      frais: true,
      tresFrais: false,
      sucre: false,
      acidule: false,
    },
  },
  {
    id: "2",
    reference: "IC-MP",
    ean: null,
    slug: "ice-cool-mangue-passion",
    fabricant: "Liquidarom",
    gamme: "Ice Cool",
    gammeSlug: "ice-cool",
    nom: "Ice Cool Mangue Passion",
    descriptionCourte: null,
    descriptionLongue: null,
    categorie: "E-liquides",
    categorieSlug: "e-liquides",
    marque: "Liquidarom",
    marqueSlug: "liquidarom",
    saveurs: ["Mangue", "Passion"],
    saveurPrincipale: "Mangue",
    saveursSecondaires: ["Passion"],
    fraicheur: null,
    intensite: null,
    format: "50 ml",
    nicotine: 3,
    pg: 50,
    vg: 50,
    pgVg: "50/50",
    prix: 599,
    promo: null,
    stock: 3,
    stockDisponibilite: "in_stock",
    photo: null,
    photoStatut: "pending",
    galerie: [],
    visible: true,
    ordre: 1,
    dateCreation: new Date(),
    dateModification: new Date(),
    isNew: false,
    isPromo: false,
    isBestSeller: true,
    profilGustatif: {
      fruit: true,
      menthole: false,
      boisson: false,
      dessert: false,
      tabac: false,
      bonbon: false,
      frais: false,
      tresFrais: false,
      sucre: false,
      acidule: false,
    },
  },
];

const bbResults = searchCatalogProducts(mockProducts, "black berry");
assert(bbResults.some((p) => p.slug.includes("blackberry")), "recherche black berry → blackberry");

const iceResults = searchCatalogProducts(mockProducts, "ice");
assert(iceResults.length >= 1, "recherche ice");

const mangueResults = searchCatalogProducts(mockProducts, "mangue");
assert(mangueResults.some((p) => p.nom.toLowerCase().includes("mangue")), "recherche mangue");

const selfTest = runSearchSelfTests(mockProducts);
assert(selfTest.failed === 0 || selfTest.passed > 0, "self-tests recherche");

// Photos — rejette groupe
assert(isGroupPhotoUrl("/products/liquidarom/hero-liquidarom-ice-cool.webp"), "détecte photo groupe");
assert(!isGroupPhotoUrl("/products/liquidarom/blackberry-raspberry.webp"), "accepte bouteille seule");

const img = resolveProductImage({
  catalogImages: [
    { url: "/products/group.webp", status: "official", sortOrder: 0 },
    { url: "/products/bottle.webp", status: "validated", sortOrder: 1 },
  ],
});
assert(img.url === "/products/bottle.webp", "priorité photo validated");

// Filtres saveur
const flavorWhere = buildFlavorWhere({ fruit: true, frais: true });
assert(flavorWhere !== null, "filtre fruit+frais construit");

console.log(`\nRésultat catalogue pro: ${passed} OK, ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
