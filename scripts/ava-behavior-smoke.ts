import { humanizeForSpeech } from "../lib/ai/ava-speech-utils";
import { searchCatalog, type CatalogProduct } from "../lib/ai/catalog-search";
import { AVA_GREETING, AVA_NAME_REPLY } from "../lib/ai/ava-constants";

const samples: CatalogProduct[] = [
  { id: "1", name: "E-liquide Frais Rouge 10ml 3mg", slug: "frais-rouge", description: "Saveur fruits frais 50/50 10ml 3mg", category: "e-liquides", brand: "All Vaps", priceCents: 590, stock: 12, imageUrl: null, isPromo: false },
  { id: "2", name: "Base DIY 50/50 1L", slug: "diy-base", description: "Base DIY PG/VG 50/50", category: "diy", brand: "Diy", priceCents: 1990, stock: 5, imageUrl: null },
  { id: "3", name: "Resistance Vaporesso GTX 0.6", slug: "gtx-06", description: "Coil mesh Vaporesso", category: "resistances", brand: "Vaporesso", priceCents: 1290, stock: 8, imageUrl: null },
  { id: "4", name: "Puff Blueberry", slug: "puff-bb", description: "Puff jetable", category: "cigarettes-electroniques", brand: "Puff", priceCents: 990, stock: 20, imageUrl: null },
  { id: "5", name: "Kit Pod MTL Start", slug: "kit-pod", description: "Cigarette electronique debutant MTL", category: "cigarettes-electroniques", brand: "All Vaps", priceCents: 2990, stock: 4, imageUrl: null },
  { id: "6", name: "Menthe Fraiche 10ml", slug: "menthe", description: "E-liquide menthe 6mg 10ml 70/30", category: "e-liquides", brand: "All Vaps", priceCents: 550, stock: 9, imageUrl: null },
];

console.log("DIY speech:", humanizeForSpeech("Voici notre selection DIY."));
console.log("AVA speech:", humanizeForSpeech("Bonjour AVA et A.V.A."));
console.log("Greeting has Je suis?", /je suis/i.test(AVA_GREETING));
console.log("Name reply:", AVA_NAME_REPLY);

for (const q of [
  "Je cherche un Frais Rouge.",
  "Je veux un DIY.",
  "Je cherche une resistance Vaporesso.",
  "Je veux une puff.",
  "Je cherche une cigarette electronique.",
  "Je veux un liquide menthe.",
]) {
  console.log(q, "=>", searchCatalog(samples, q, { limit: 3 }).map((p) => p.name).join(" | ") || "(none)");
}

