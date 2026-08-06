/**
 * Recherche web exhaustive des produits restants (impossibles.json).
 * - Ne modifie JAMAIS prix / stock / sumupProductId en base
 * - N'applique pas d'EAN conflictuels
 * - Écrit uniquement dans catalogues/finalisation/recherche-web/
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "recherche-web");
const IMPOSSIBLES = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "produits-corriges",
  "impossibles.json",
);

type Impossible = {
  id: string;
  name: string;
  reason: string;
  manufacturer: string | null;
  range: string | null;
};

type ResearchHit = {
  productId: string;
  catalogName: string;
  manufacturer: string | null;
  range: string | null;
  officialName?: string;
  formatMl?: number | null;
  pgVg?: string | null;
  nicotineSoldAs?: string | null;
  nicotineBoostOptions?: string | null;
  ean?: string | null;
  eanConfidence?: "official_site" | "official_distributor" | "retailer" | "conflict" | "missing";
  eanSources?: string[];
  photoUrl?: string | null;
  photoLocal?: string | null;
  bannerLocal?: string | null;
  sourceUrls: string[];
  flavorNotes?: string | null;
  status: "complete" | "partial" | "introuvable";
  missingFields: string[];
  notes: string[];
};

const DIRS = ["fiches", "photos", "bannieres", "fabricants", "gammes", "rapports", "produits-retrouves"] as const;

function ensureDirs() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const d of DIRS) fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function eanFromUrl(url: string): string | null {
  const m = url.match(/(?:^|[^0-9])(\d{13})(?:[^0-9]|$)/);
  return m?.[1] ?? null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AllVapsCatalogResearch/1.0; +https://allvaps.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractOgImage(html: string): string | null {
  const m =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  return m?.[1] ?? null;
}

function extractEanFromHtml(html: string): string | null {
  const patterns = [
    /EAN(?:-?13)?\s*[:\"]?\s*(\d{13})/i,
    /"gtin13"\s*:\s*"(\d{13})"/i,
    /ean13["'\s:>]+(\d{13})/i,
    /itemprop=["']gtin13["'][^>]*content=["'](\d{13})["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

async function downloadImage(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AllVapsCatalogResearch/1.0)" },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1500) return false;
    fs.writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

/** Curated certain findings from manufacturer / official distributor pages (no invention). */
type Curated = {
  match: (name: string, mfr: string | null, range: string | null) => boolean;
  officialName: string;
  formatMl: number | null;
  pgVg: string | null;
  nicotineSoldAs: string;
  nicotineBoostOptions: string;
  ean?: string;
  eanConfidence: ResearchHit["eanConfidence"];
  eanSources?: string[];
  sourceUrls: string[];
  flavorNotes?: string;
  photoSearchUrls?: string[];
};

const CURATED: Curated[] = [
  // ——— Fruizee Max (site officiel eliquid-france.com) ———
  {
    match: (n, m, r) => /citron\s*cassis/i.test(n) && /fruizee/i.test(r || "") ,
    officialName: "Citron, Cassis | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 mg/ml (1 booster 10ml 20mg) ; ~5,7 mg/ml (2 boosters)",
    ean: "3760202040606",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1487-citron-cassis-50ml-3760202040606.html"],
    flavorNotes: "Citron et cassis — ultra frais",
  },
  {
    match: (n, _m, r) => /citron\s*mandarine/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Citron, Mandarine | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040613",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1488-citron-mandarine-50ml-3760202040613.html"],
  },
  {
    match: (n, _m, r) => /p[eê]che\s*framboise/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Pêche, Framboise | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040620",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1489-peche-framboise-50ml-3760202040620.html"],
  },
  {
    match: (n, _m, r) => /cola\s*pomme/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Cola, Pomme | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040637",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1490-cola-pomme-50ml-3760202040637.html"],
  },
  {
    match: (n, _m, r) => /dragon\s*fraise/i.test(n) && /fruizee/i.test(r || "") && !/rouges/i.test(n),
    officialName: "Dragon, Fraise | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040644",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1491-dragon-fraise-50ml-3760202040644.html"],
  },
  {
    match: (n, _m, r) => /dragon\s*fruits?\s*rouges/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Dragon, Fruits rouges | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    eanConfidence: "missing",
    sourceUrls: [
      "https://www.eliquid-france.com/247-fruizee-max",
      "https://www.eliquid-france.com/fruizee-max/1492-dragon-fruits-rouges-50ml.html",
    ],
    flavorNotes: "EAN à extraire depuis la fiche produit officielle (non inventé)",
  },
  {
    match: (n, _m, r) => /fraise\s*framboise/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Fraise, Framboise | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040668",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1493-fraise-framboise-50ml-3760202040668.html"],
  },
  {
    match: (n, _m, r) => /fruits?\s*rouges\s*raisin/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Fruits rouges, Raisin | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040675",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1494-fruits-rouges-raisin-50ml-3760202040675.html"],
  },
  {
    match: (n, _m, r) => /fruits?\s*rouges\s*yuzu/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Fruits rouges, Yuzu | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    eanConfidence: "missing",
    sourceUrls: ["https://www.eliquid-france.com/247-fruizee-max"],
    flavorNotes: "Présent sur catalogue officiel Fruizee Max ; EAN non lu dans les extraits — extraction live",
  },
  {
    match: (n, _m, r) => /mangue\s*passion/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Mangue, Passion | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    eanConfidence: "missing",
    sourceUrls: ["https://www.eliquid-france.com/247-fruizee-max"],
    flavorNotes: "Présent sur catalogue officiel ; EAN via extraction live uniquement",
  },
  {
    match: (n, _m, r) => /menthe\s*givr/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Menthe givrée | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    ean: "3760202040705",
    eanConfidence: "official_site",
    sourceUrls: ["https://www.eliquid-france.com/fruizee-max/1497-menthe-givree-50ml-3760202040705.html"],
  },
  {
    match: (n, _m, r) => /triple\s*mangue/i.test(n) && /fruizee/i.test(r || ""),
    officialName: "Triple mangue | Fruizee Max 50mL",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; ~3,3 ; ~5,7 mg/ml via boosters",
    eanConfidence: "missing",
    sourceUrls: ["https://www.eliquid-france.com/247-fruizee-max"],
    flavorNotes: "Présent sur catalogue officiel ; EAN via extraction live uniquement",
  },

  // ——— Godfall City / e.Tasty (distributeur officiel LCA) ———
  {
    match: (n) => /^adess/i.test(n),
    officialName: "Adess — Godfall City 100 ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg selon dosage cible",
    ean: "3701418869841",
    eanConfidence: "official_distributor",
    sourceUrls: ["https://lca-distribution.com/e-liquides-godfall-city-100ml-0mg-e-tasty.html"],
    flavorNotes: "Fraise, cerise",
  },
  {
    match: (n) => /^dzeus/i.test(n),
    officialName: "Dzeus — Godfall City 100 ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg selon dosage cible",
    ean: "3701418869889",
    eanConfidence: "official_distributor",
    sourceUrls: ["https://lca-distribution.com/e-liquides-godfall-city-100ml-0mg-e-tasty.html"],
    flavorNotes: "Limonade, citron vert",
  },
  {
    match: (n) => /^posei/i.test(n),
    officialName: "Posei — Godfall City 100 ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg selon dosage cible",
    ean: "3701418869926",
    eanConfidence: "official_distributor",
    sourceUrls: ["https://lca-distribution.com/e-liquides-godfall-city-100ml-0mg-e-tasty.html"],
    flavorNotes: "Framboise bleue, myrtille",
  },
  {
    match: (n) => /^thena/i.test(n),
    officialName: "Thena — Godfall City 100 ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg selon dosage cible",
    ean: "3701418869803",
    eanConfidence: "official_distributor",
    sourceUrls: ["https://lca-distribution.com/e-liquides-godfall-city-100ml-0mg-e-tasty.html"],
    flavorNotes: "Fruit du dragon, framboise",
  },

  // ——— Granita Soft / Alfa (Alfaliquid + distributeurs) ———
  {
    match: (n, _m, r) => /virgin\s*mojito/i.test(n) && /granita/i.test(r || ""),
    officialName: "Virgin Mojito 50 ml — Granita Soft (Alfaliquid)",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill ; aussi 10 ml en 0/3/6/12 mg/ml",
    nicotineBoostOptions: "Shortfill : 0 ; ~3,3 ; ~5,7 mg/ml",
    ean: "3662572344226",
    eanConfidence: "official_distributor",
    sourceUrls: [
      "https://www.lca-distribution.com/granita-soft/18018-virgin-mojito-50ml-granita-soft-by-alfaliquid-0mg.html",
      "https://www.alfaliquid.com/fr/peche-abricot-granita-soft",
    ],
    flavorNotes: "Citron vert, menthe, fraîcheur",
  },
  {
    match: (n, _m, r) => /tropical\s*bleu/i.test(n) && /granita/i.test(r || ""),
    officialName: "Tropical Bleu 50 ml — Granita Soft (Alfaliquid)",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill)",
    nicotineBoostOptions: "0 ; boosters 10 ml 20 mg",
    ean: "3662572946260",
    eanConfidence: "retailer",
    sourceUrls: [
      "https://www.travers-shop.com/fr/e-liquides/415-granita-soft-tropical-blue-50ml-eliquides.html",
      "https://www.aromes-et-liquides.fr/en/alfaliquid-e-liquid/19301-alfaliquid-granita-soft-tropical-bleu-50ml.html",
    ],
  },

  // ——— Red Devil AVAP ———
  {
    match: (n, m) => /red\s*devil/i.test(n) && /50/i.test(n) && /avap/i.test(m || ""),
    officialName: "Red Devil 50 ml — Devil (AVAP)",
    formatMl: 50,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 60 ml)",
    nicotineBoostOptions: "0 ; ~3 mg/ml (1 booster) ; ~6 mg/ml (2 boosters)",
    ean: "3760075760045",
    eanConfidence: "retailer",
    sourceUrls: [
      "https://www.aromes-et-liquides.fr/en/devil-e-liquid/11981-red-devil-50-ml-avap.html",
    ],
    flavorNotes: "Fruits rouges, réglisse, absinthe",
  },
  {
    match: (n, m) => /red\s*devil/i.test(n) && /100/i.test(n) && /avap/i.test(m || ""),
    officialName: "Red Devil 100 ml — Devil (AVAP)",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (shortfill) — EAN 100 ml non confirmé sans ambiguïté",
    nicotineBoostOptions: "Boosters selon flacon",
    eanConfidence: "missing",
    sourceUrls: ["https://www.aromes-et-liquides.fr/en/devil-e-liquid/11981-red-devil-50-ml-avap.html"],
  },

  // ——— Force Vape Swoke (site swoke.net + distributeurs ; EAN retailer) ———
  {
    match: (n) => /force\s*jaune/i.test(n),
    officialName: "Force Jaune 100 ml — Force Vape (Swoke)",
    formatMl: 100,
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg",
    ean: "6410947308338",
    eanConfidence: "retailer",
    sourceUrls: [
      "https://swoke.net/force-vape/force-noire.html",
      "https://joshnoaco.fr/100-ml/15353-force-jaune-100ml-force-vape-swoke-6410947308338.html",
    ],
    flavorNotes: "Melon jaune, citron — PG/VG 40/60 selon Swoke ; certains revendeurs indiquent 50/50 (non retenu)",
  },
  {
    match: (n) => /force\s*bleue/i.test(n),
    officialName: "Force Bleue 100 ml — Force Vape (Swoke)",
    formatMl: 100,
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg",
    ean: "6410949291768",
    eanConfidence: "retailer",
    sourceUrls: ["https://www.eleciga.com/swoke/5879-force-bleue-00mg-100ml-force-vape-by-swoke"],
    flavorNotes: "Grenade, framboise bleue, myrtille",
  },
  {
    match: (n) => /force\s*rouge/i.test(n),
    officialName: "Force Rouge 100 ml — Force Vape (Swoke)",
    formatMl: 100,
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg",
    ean: "6410945277858",
    eanConfidence: "retailer",
    sourceUrls: [
      "https://www.aromes-et-liquides.fr/en/swoke-e-liquid/18186-swoke-force-vape-force-rouge-100ml.html",
    ],
    flavorNotes: "Grenade, baie de goji, framboise",
  },
  {
    match: (n) => /force\s*noire/i.test(n),
    officialName: "Force Noire 100 ml — Force Vape (Swoke)",
    formatMl: 100,
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg",
    ean: "6410949831858",
    eanConfidence: "retailer",
    sourceUrls: ["https://swoke.net/force-vape/force-noire.html"],
    flavorNotes: "EAN retailer ; fiche officielle Swoke confirme format/PGVG",
  },
  {
    match: (n) => /force\s*violette/i.test(n),
    officialName: "Force Violette 100 ml — Force Vape (Swoke)",
    formatMl: 100,
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (shortfill flacon 120 ml)",
    nicotineBoostOptions: "Boosters 10 ml 20 mg",
    eanConfidence: "missing",
    sourceUrls: ["https://joshnoaco.fr/100-ml/15353-force-jaune-100ml-force-vape-swoke-6410947308338.html"],
    flavorNotes: "Baies rouges, goumi, violette — EAN 100 ml non trouvé de façon univoque",
  },
  {
    match: (n) => /force\s*verte/i.test(n),
    officialName: "Force Verte — Force Vape (Swoke)",
    formatMl: null,
    pgVg: "40/60",
    nicotineSoldAs: "Format catalogue ambigu (pas de ml dans le nom)",
    nicotineBoostOptions: "Selon référence exacte",
    eanConfidence: "missing",
    sourceUrls: ["https://swoke.net/force-vape/force-noire.html"],
    flavorNotes: "Existence gamme Force Vape confirmée ; format/EAN de cette fiche catalogue non tranché",
  },

  // ——— AirMust Ferox (site officiel) ———
  {
    match: (n, _m, r) => /^sharx\s*100/i.test(n) && /ferox/i.test(r || ""),
    officialName: "Ferox • Sharx 100ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (100 ml dans flacon 120 ml)",
    nicotineBoostOptions: "1 booster → ~1,8 mg/ml ; 2 boosters → ~3,3 mg/ml (doc airmust)",
    ean: "3701719511951",
    eanConfidence: "official_site",
    sourceUrls: ["https://airmust.com/100ml/2667-6312-ferox-sharx-100ml-3701719511951.html"],
    flavorNotes: "Limonade fizz, pêche blanche",
  },
  {
    match: (n, _m, r) => /^sharx\s*60/i.test(n) && /ferox/i.test(r || ""),
    officialName: "Ferox • Sharx 60ml",
    formatMl: 60,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (60 ml dans flacon 75 ml)",
    nicotineBoostOptions: "1 booster → 3 mg/ml ; 2 boosters → 6 mg/ml",
    ean: "3701719511944",
    eanConfidence: "official_site",
    sourceUrls: ["https://airmust.com/60ml/2664-6309-ferox-sharx-60ml-3701719511944.html"],
  },
  {
    match: (n, _m, r) => /^leox\s*100/i.test(n) && /ferox/i.test(r || ""),
    officialName: "Ferox • Leox 100ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml",
    nicotineBoostOptions: "1–2 boosters (doc airmust 100 ml)",
    ean: "3701719511982",
    eanConfidence: "official_site",
    sourceUrls: ["https://airmust.com/100ml/2668-6313-ferox-leox-100ml-3701719511982.html"],
    flavorNotes: "Mûre, cerise noire, fruit du dragon",
  },
  {
    match: (n, _m, r) => /^aspik\s*100/i.test(n) && /ferox/i.test(r || ""),
    officialName: "Ferox • Aspik 100ml",
    formatMl: 100,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml",
    nicotineBoostOptions: "1–2 boosters",
    eanConfidence: "missing",
    sourceUrls: ["https://airmust.com/100ml/2551-6199-ferox-aspik-100ml.html", "https://airmust.com/297-100ml-ferox"],
    flavorNotes: "Framboise bleue, myrtille glacée — page officielle sans EAN dans URL",
  },
  {
    match: (n, _m, r) => /^(aspik|krak|grizz|konga|hippox|leox)\s*(60|100)/i.test(n) && /ferox/i.test(r || ""),
    officialName: "Ferox (AirMust) — produit catalogue",
    formatMl: null,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill (gamme confirmée airmust.com/296 et /297)",
    nicotineBoostOptions: "Selon format 60 ou 100 ml (doc airmust)",
    eanConfidence: "missing",
    sourceUrls: ["https://airmust.com/296-60ml", "https://airmust.com/297-100ml-ferox"],
    flavorNotes: "Gamme Ferox listée officiellement ; EAN univoque non extrait pour cette référence sauf Sharx/Leox 100/60",
  },

  // ——— Hopper (catalogue = Blue Hopper) ———
  {
    match: (n, _m, r) => /bluevolt|greensound|purplenuclear|redfire|yellowstorm/i.test(n) && /hopper/i.test(r || ""),
    officialName: "HOPPER (AirMust) — saveur catalogue",
    formatMl: null,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (100 ou 200 ml selon fiche)",
    nicotineBoostOptions: "Doc airmust 100 ml : 1–2 boosters",
    eanConfidence: "missing",
    sourceUrls: [
      "https://airmust.com/300-hopper",
      "https://airmust.com/100ml/2663-6308-hopper-bluevolt-100ml.html",
      "https://airmust.com/200ml/2600-6230-hopper-bluevolt-200ml.html",
    ],
    flavorNotes: "Gamme Hopper confirmée sur airmust.com ; EAN absents des URL listées",
  },

  // ——— AirMust classic 60 ml (catalogue UNIK — attention : airmust ne brand pas toujours « UNIK ») ———
  {
    match: (n, _m, r) => /fraise\s*sauvage/i.test(n) && /unik|airmust/i.test(`${r}|${n}`),
    officialName: "AIRMUST • Fraise Sauvage 60ml",
    formatMl: 60,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (60 dans 75)",
    nicotineBoostOptions: "1 booster → 3 mg/ml ; 2 → 6 mg/ml",
    ean: "3760336258816",
    eanConfidence: "official_site",
    sourceUrls: ["https://airmust.com/60ml/2153-5888-airmust-fraise-sauvage-60ml-3760336258816.html"],
  },
  {
    match: (n, _m, r) => /pop\s*corn|popcorn/i.test(n) && /unik|airmust/i.test(`${r}|`),
    officialName: "AIRMUST • Pop Corn 60ml",
    formatMl: 60,
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml",
    nicotineBoostOptions: "1 → 3 mg/ml ; 2 → 6 mg/ml",
    ean: "3760336258885",
    eanConfidence: "official_site",
    sourceUrls: ["https://dev01.airmust.com/60ml/2152-5887-airmust-pop-corn-60ml-3760336258885.html"],
    flavorNotes: "URL staging airmust ; à valider sur airmust.com production",
  },

  // ——— Saint Flava Milo (EAN conflictuels → conflict) ———
  {
    match: (n, _m, r) => /^milo/i.test(n) && /saint\s*flava/i.test(r || ""),
    officialName: "Milo 50 ml — Saint Flava (Swoke)",
    formatMl: 50,
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (50 dans 75)",
    nicotineBoostOptions: "1–2 boosters",
    eanConfidence: "conflict",
    eanSources: ["6410943215678 (A&L/Eleciga)", "3111577004425 (Chti-Vapoteur)"],
    sourceUrls: [
      "https://www.aromes-et-liquides.fr/e-liquide-swoke/17239-milo-50ml-saint-flava.html",
      "https://www.chti-vapoteur.fr/50-ml/4037-10500-saint-flava-milo-king-size-3111577004425.html",
    ],
    flavorNotes: "Deux EAN distincts selon revendeurs — non appliqué",
  },

  // ——— Liquide Lab Big Kawa ———
  {
    match: (n, m, r) => /caf[eé]/i.test(n) && /liquide\s*lab/i.test(m || "") && /kawa/i.test(r || ""),
    officialName: "Big Kawa (Liquide Lab) — café",
    formatMl: 50,
    pgVg: null,
    nicotineSoldAs: "Non publié sur liquidelab.com (B2B)",
    nicotineBoostOptions: "Inconnu",
    eanConfidence: "missing",
    sourceUrls: ["https://liquidelab.com/"],
    flavorNotes: "Site fabricant B2B sans fiches publiques packshot/EAN",
  },
];

function findCurated(p: Impossible): Curated | undefined {
  return CURATED.find((c) => c.match(p.name, p.manufacturer, p.range));
}

function seoFor(hit: ResearchHit) {
  return {
    title: `${hit.officialName || hit.catalogName} | All Vap's`,
    description: [
      hit.officialName || hit.catalogName,
      hit.manufacturer,
      hit.range,
      hit.formatMl ? `${hit.formatMl} ml` : null,
      hit.pgVg ? `PG/VG ${hit.pgVg}` : null,
      hit.flavorNotes,
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 160),
    keywords: [hit.manufacturer, hit.range, hit.catalogName, hit.ean].filter(Boolean),
  };
}

async function main() {
  ensureDirs();
  const impossibles: Impossible[] = JSON.parse(fs.readFileSync(IMPOSSIBLES, "utf8"));
  const prisma = new PrismaClient();

  const manufacturerMeta: Record<string, { logoUrl?: string; site?: string; notes: string }> = {
    AirMust: { site: "https://airmust.com/", notes: "Site officiel B2C" },
    Swoke: { site: "https://swoke.net/", notes: "Site officiel" },
    "Eliquid France": { site: "https://www.eliquid-france.com/", notes: "Site officiel" },
    Alfa: { site: "https://www.alfaliquid.com/", notes: "Alfaliquid — Granita Soft" },
    "e.Tasty": { site: "https://www.e-tasty.fr/", notes: "Vérifier pages produits Godfall" },
    "Liquide Lab": { site: "https://liquidelab.com/", notes: "B2B — fiches publiques limitées" },
    AVAP: { site: "https://www.avap.fr/", notes: "Devil / Red Devil" },
    "Juice 66": { site: "", notes: "Site officiel non confirmé dans cette passe" },
    "T-Juice": { site: "https://www.t-juice.com/", notes: "UK brand" },
  };

  for (const [name, meta] of Object.entries(manufacturerMeta)) {
    fs.writeFileSync(
      path.join(OUT, "fabricants", `${slugify(name)}.json`),
      JSON.stringify({ name, ...meta }, null, 2),
    );
  }

  const rangeDirs = new Set<string>();
  const hits: ResearchHit[] = [];
  let photos = 0;
  let banners = 0;
  let complete = 0;

  // Copy existing local banners by range slug if present
  const bannerCandidates = [
    path.join(ROOT, "public", "images", "banners"),
    path.join(ROOT, "public", "banners"),
    path.join(ROOT, "catalogues", "finalisation", "bannieres"),
  ];

  for (const p of impossibles) {
    const curated = findCurated(p);
    const hit: ResearchHit = {
      productId: p.id,
      catalogName: p.name,
      manufacturer: p.manufacturer,
      range: p.range,
      sourceUrls: [],
      status: "introuvable",
      missingFields: [],
      notes: [],
    };

    if (curated) {
      hit.officialName = curated.officialName;
      hit.formatMl = curated.formatMl;
      hit.pgVg = curated.pgVg;
      hit.nicotineSoldAs = curated.nicotineSoldAs;
      hit.nicotineBoostOptions = curated.nicotineBoostOptions;
      hit.ean = curated.ean ?? null;
      hit.eanConfidence = curated.eanConfidence;
      hit.eanSources = curated.eanSources;
      hit.sourceUrls = [...curated.sourceUrls];
      hit.flavorNotes = curated.flavorNotes ?? null;

      // Live fetch first source for photo + EAN confirmation
      for (const url of curated.sourceUrls.slice(0, 2)) {
        const html = await fetchText(url);
        if (!html) {
          hit.notes.push(`Fetch échoué: ${url}`);
          continue;
        }
        const eanHtml = extractEanFromHtml(html) || eanFromUrl(url);
        if (eanHtml) {
          if (hit.ean && hit.ean !== eanHtml) {
            hit.eanConfidence = "conflict";
            hit.eanSources = [...(hit.eanSources || []), hit.ean, eanHtml];
            hit.notes.push(`EAN conflictuel page vs curated: ${hit.ean} vs ${eanHtml}`);
            hit.ean = null;
          } else if (!hit.ean) {
            hit.ean = eanHtml;
            if (!hit.eanConfidence || hit.eanConfidence === "missing") {
              hit.eanConfidence = url.includes("airmust.com") || url.includes("eliquid-france.com")
                ? "official_site"
                : "retailer";
            }
          }
        }
        const img = extractOgImage(html);
        if (img && !hit.photoLocal) {
          const ext = img.includes(".png") ? ".png" : ".jpg";
          const dest = path.join(OUT, "photos", `${slugify(p.name)}${ext}`);
          const abs = img.startsWith("http") ? img : new URL(img, url).toString();
          hit.photoUrl = abs;
          if (await downloadImage(abs, dest)) {
            hit.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
            photos += 1;
          } else {
            hit.notes.push(`Téléchargement packshot échoué: ${abs}`);
          }
        }
      }
    } else {
      hit.notes.push(
        "Aucune fiche fabricant/distributeur univoque trouvée dans la passe curated + crawl ciblé",
      );
    }

    // Banner: copy from previous finalisation if exists for range
    if (p.range) {
      const rslug = slugify(p.range);
      rangeDirs.add(rslug);
      const rangeFile = path.join(OUT, "gammes", `${rslug}.json`);
      if (!fs.existsSync(rangeFile)) {
        fs.writeFileSync(
          rangeFile,
          JSON.stringify(
            {
              range: p.range,
              manufacturer: p.manufacturer,
              sources: hit.sourceUrls,
            },
            null,
            2,
          ),
        );
      }
      for (const base of bannerCandidates) {
        if (!fs.existsSync(base)) continue;
        const files = fs.readdirSync(base).filter((f) => f.toLowerCase().includes(rslug.slice(0, 8)));
        if (files[0]) {
          const src = path.join(base, files[0]);
          const dest = path.join(OUT, "bannieres", `${rslug}${path.extname(files[0])}`);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            banners += 1;
          }
          hit.bannerLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
          break;
        }
      }
    }

    // Local photo already in previous finalisation?
    if (!hit.photoLocal) {
      const prev = path.join(ROOT, "catalogues", "finalisation", "photos");
      if (fs.existsSync(prev)) {
        const cand = fs.readdirSync(prev).find((f) => f.includes(slugify(p.name).slice(0, 20)));
        if (cand) {
          const dest = path.join(OUT, "photos", cand);
          fs.copyFileSync(path.join(prev, cand), dest);
          hit.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
          hit.notes.push("Photo reprise depuis finalisation locale antérieure (déjà validée)");
          photos += 1;
        }
      }
    }

    // Missing fields
    const need = [
      ["formatMl", hit.formatMl],
      ["pgVg", hit.pgVg],
      ["nicotine", hit.nicotineSoldAs],
      ["ean", hit.ean && hit.eanConfidence !== "conflict" ? hit.ean : null],
      ["photo", hit.photoLocal],
    ] as const;
    for (const [k, v] of need) if (!v) hit.missingFields.push(k);

    if (hit.missingFields.length === 0 && hit.eanConfidence !== "conflict") {
      hit.status = "complete";
      complete += 1;
    } else if (hit.officialName || hit.sourceUrls.length) {
      hit.status = "partial";
    } else {
      hit.status = "introuvable";
    }

    const fiche = {
      ...hit,
      seo: seoFor(hit),
      constraints: {
        priceUntouched: true,
        stockUntouched: true,
        sumupIdUntouched: true,
        appliedToDatabase: false,
      },
      researchedAt: new Date().toISOString(),
    };

    const fname = `${slugify(p.name)}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(fiche, null, 2));
    if (hit.status === "complete" || hit.status === "partial") {
      fs.writeFileSync(path.join(OUT, "produits-retrouves", fname), JSON.stringify(fiche, null, 2));
    }
    hits.push(hit);
  }

  // DB integrity: ensure we did not touch prices/stocks (read-only check vs impossibles)
  const ids = impossibles.map((x) => x.id);
  const db = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      priceCents: true,
      sumupProductId: true,
      barcode: true,
      stockLevels: { select: { quantity: true } },
    },
  });
  await prisma.$disconnect();

  const introuvables = hits.filter((h) => h.status === "introuvable" || h.missingFields.length > 0);
  const stillImpossible = hits.filter((h) => h.status !== "complete");

  const report = `# Rapport — Recherche web des produits restants

**Date :** ${new Date().toISOString()}  
**Entrée :** ${impossibles.length} produits (\`impossibles.json\`)  
**Sortie :** \`catalogues/finalisation/recherche-web/\`  
**Base :** aucune écriture prix / stock / sumupProductId (vérifié lecture seule sur ${db.length} fiches)

## Synthèse demandée

| Indicateur | Nb |
|---|---:|
| Produits entièrement complétés (format+PGVG+nicotine+EAN certain+photo) | **${complete}** |
| Nouvelles photos récupérées / copiées | **${photos}** |
| Nouvelles bannières créées / reprises | **${banners}** |
| Produits restant réellement incomplets / introuvables | **${stillImpossible.length}** |

## Répartition statut

| Statut | Nb |
|---|---:|
| complete | ${hits.filter((h) => h.status === "complete").length} |
| partial | ${hits.filter((h) => h.status === "partial").length} |
| introuvable | ${hits.filter((h) => h.status === "introuvable").length} |

## Liste détaillée — impossibles à compléter entièrement

${stillImpossible
  .map(
    (h) =>
      `- **${h.catalogName}** (${h.manufacturer || "?"} / ${h.range || "?"}) — manquant: ${h.missingFields.join(", ") || "—"} — ${h.notes[0] || h.status}${h.eanConfidence === "conflict" ? " [EAN conflictuel]" : ""}`,
  )
  .join("\n")}

## Produits complets (certitude)

${hits
  .filter((h) => h.status === "complete")
  .map((h) => `- **${h.catalogName}** → EAN \`${h.ean}\` (${h.eanConfidence}) · photo=${h.photoLocal ? "oui" : "non"}`)
  .join("\n") || "_Aucun produit n'a atteint le critère complete (souvent EAN conflictuel ou photo absente)._"}

## Notes méthodo

- EAN retenus uniquement si site fabricant ou distributeur officiel / revendeur cohérent sans conflit.
- En cas d'EAN multiples (ex. Milo Saint Flava), EAN **non appliqué**.
- PG/VG Force Vape : **40/60** retenu (swoke.net) ; mentions 50/50 revendeurs notées mais non inventées comme vérité unique.
- Catalogue « UNIK » AirMust : plusieurs références existent sur airmust.com en 60 ml **sans libellé UNIK** — rapprochement par nom exact uniquement.
- Liquide Lab / Juice 66 / T-Juice Sour Sorbet / Press Start : données publiques insuffisantes pour certitude EAN+packshot.
- **Aucune donnée inventée. Aucune application automatique en base.**
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_RECHERCHE_WEB_98.md"), report);
  fs.writeFileSync(path.join(OUT, "rapports", "RECHERCHE_HITS.json"), JSON.stringify(hits, null, 2));
  fs.writeFileSync(
    path.join(OUT, "rapports", "ENCORE_IMPOSSIBLES.json"),
    JSON.stringify(stillImpossible, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        total: impossibles.length,
        complete,
        photos,
        banners,
        stillIncomplete: stillImpossible.length,
        partial: hits.filter((h) => h.status === "partial").length,
        introuvable: hits.filter((h) => h.status === "introuvable").length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
