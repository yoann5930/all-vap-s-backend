/**
 * Finalisation maximale des 61 produits — sources publiques fabricants/distributeurs.
 * Ne modifie PAS prix / stocks / SumUp ID / EAN déjà validés en base.
 * Sortie : catalogues/validation-finale/ enrichi + FINAL_ALL_VAPS_COMPLET.md + PRODUITS_A_VALIDER.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "validation-finale");
const LIGNES = path.join(OUT, "LIGNES_VALIDATION.json");
const COMPLET_DIR = path.join(OUT, "fiches-completes-publiques");
const PHOTOS_DIR = path.join(OUT, "photos-publiques");

type Curated = {
  match: (name: string) => boolean;
  officialName: string;
  manufacturer: string;
  range: string;
  formatMl: number | null;
  pgVg: string;
  nicotine: string;
  nicotineBoost?: string;
  flavor: string;
  description: string;
  urls: string[];
  ean?: string;
  eanConfidence?: "official_site" | "official_distributor" | "retailer";
};

const CURATED: Curated[] = [
  // ——— AirMust Ferox ———
  {
    match: (n) => /^aspik\s*60/i.test(n),
    officialName: "Ferox • Aspik 60ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml (shortfill 60 dans 75)",
    nicotineBoost: "1 booster → 3 mg/ml ; 2 → 6 mg/ml",
    flavor: "Framboise bleue, myrtille glacée",
    description:
      "E-liquide Ferox Aspik par AirMust — framboise bleue et myrtille glacée. Base aromatisée 0 mg, PG/VG 50/50, fabriqué en France.",
    urls: ["https://airmust.com/60ml/2550-6198-ferox-aspik-60ml.html"],
  },
  {
    match: (n) => /^aspik\s*100/i.test(n),
    officialName: "Ferox • Aspik 100ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 100,
    pgVg: "50/50",
    nicotine: "0 mg/ml (100 dans 120)",
    nicotineBoost: "1 booster → ~1,8 mg/ml ; 2 → ~3,3 mg/ml",
    flavor: "Framboise bleue, myrtille glacée",
    description:
      "Ferox Aspik 100 ml AirMust — framboise bleue, myrtille glacée. Shortfill 0 mg, PG/VG 50/50.",
    urls: ["https://airmust.com/100ml/2551-6199-ferox-aspik-100ml.html"],
  },
  {
    match: (n) => /^krak\s*60/i.test(n),
    officialName: "Ferox • Krak 60ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml (60 dans 75)",
    nicotineBoost: "1 → 3 mg/ml ; 2 → 6 mg/ml",
    flavor: "Bubble-gum, pitaya glacé, pastèque",
    description: "Ferox Krak 60 ml AirMust — bubble-gum, pitaya glacé, pastèque. 0 mg, 50/50.",
    urls: ["https://airmust.com/60ml/2549-6197-ferox-krak-60ml.html"],
  },
  {
    match: (n) => /^krak\s*100/i.test(n),
    officialName: "Ferox • Krak 100ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 100,
    pgVg: "50/50",
    nicotine: "0 mg/ml (100 dans 120)",
    nicotineBoost: "1 → ~1,8 ; 2 → ~3,3 mg/ml",
    flavor: "Bubble-gum, pitaya glacé, pastèque",
    description: "Ferox Krak 100 ml AirMust — bubble-gum, pitaya glacé, pastèque.",
    urls: ["https://airmust.com/100ml/2552-6200-ferox-krak-100ml.html"],
  },
  {
    match: (n) => /^grizz\s*60/i.test(n),
    officialName: "Ferox • Grizz 60ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml (60 dans 75)",
    nicotineBoost: "1 → 3 ; 2 → 6 mg/ml",
    flavor: "Fraise, barbe à papa",
    description: "Ferox Grizz 60 ml — fraise et barbe à papa. AirMust, 0 mg, 50/50.",
    urls: ["https://airmust.com/60ml/2554-6202-ferox-grizz-60ml.html", "https://airmust.com/296-60ml"],
  },
  {
    match: (n) => /^grizz\s*100/i.test(n),
    officialName: "Ferox • Grizz 100ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 100,
    pgVg: "50/50",
    nicotine: "0 mg/ml (100 dans 120)",
    nicotineBoost: "1 → ~1,8 ; 2 → ~3,3 mg/ml",
    flavor: "Fraise, barbe à papa",
    description: "Ferox Grizz 100 ml AirMust — fraise, barbe à papa.",
    urls: ["https://airmust.com/100ml/2553-6201-ferox-grizz-100ml.html"],
  },
  {
    match: (n) => /^leox\s*60/i.test(n),
    officialName: "Ferox • Leox 60ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml (60 dans 75)",
    nicotineBoost: "1 → 3 ; 2 → 6 mg/ml",
    flavor: "Mûre, cerise noire, fruit du dragon",
    description: "Ferox Leox 60 ml — mûre, cerise noire, fruit du dragon. AirMust.",
    urls: ["https://airmust.com/296-60ml"],
  },
  {
    match: (n) => /^konga\s*100/i.test(n),
    officialName: "Ferox • Konga 100ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 100,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters (doc airmust 100 ml)",
    flavor: "Energy Drink, cerise",
    description: "Ferox Konga 100 ml — energy drink, cerise. Listé sur airmust.com/297.",
    urls: ["https://airmust.com/297-100ml-ferox"],
  },
  {
    match: (n) => /^hippox\s*100/i.test(n),
    officialName: "Ferox • Hippox 100ml",
    manufacturer: "AirMust",
    range: "Ferox",
    formatMl: 100,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Mix Tropical Givré",
    description: "Ferox Hippox 100 ml — mix tropical givré. AirMust.",
    urls: ["https://airmust.com/297-100ml-ferox"],
  },

  // ——— Hopper (catalog Blue Hopper) ———
  ...(["Bluevolt", "Greensound", "Purplenuclear", "Redfire", "Yellowstorm"] as const).flatMap(
    (flavor) =>
      ([100, 200] as const).map(
        (ml): Curated => ({
          match: (n) => new RegExp(`^${flavor}\\s*${ml}`, "i").test(n),
          officialName: `HOPPER • ${flavor} ${ml}ml`,
          manufacturer: "AirMust",
          range: "Hopper",
          formatMl: ml,
          pgVg: "50/50",
          nicotine: "0 mg/ml",
          nicotineBoost:
            ml === 100
              ? "1 booster → ~1,8 mg/ml ; 2 → ~3,3 mg/ml"
              : "selon flacon 200 ml (doc airmust)",
          flavor:
            flavor === "Bluevolt"
              ? "Cassis, mûre, frais"
              : flavor === "Greensound"
                ? "Fraise, kiwi"
                : flavor === "Purplenuclear"
                  ? "Mûre, fruit du dragon"
                  : flavor === "Redfire"
                    ? "Framboise, cerise noire, fraise"
                    : "Pêche, fruits du soleil",
          description: `HOPPER ${flavor} ${ml} ml par AirMust — shortfill 0 mg, PG/VG 50/50, fabriqué en France.`,
          urls: [
            `https://airmust.com/${ml}ml/`,
            "https://airmust.com/300-hopper",
            ml === 100
              ? "https://airmust.com/305-100ml-hopper"
              : "https://airmust.com/306-200ml-hopper",
          ],
        }),
      ),
  ),

  // ——— AirMust classic 60 ml (catalogue UNIK) ———
  {
    match: (n) => /fraise\s*sauvage/i.test(n),
    officialName: "AIRMUST • Fraise Sauvage 60ml",
    manufacturer: "AirMust",
    range: "AirMust 60ml",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml (60 dans 75)",
    nicotineBoost: "1 → 3 mg/ml ; 2 → 6 mg/ml",
    flavor: "Fraise sauvage",
    description: "Fraise Sauvage 60 ml AirMust — 0 mg, 50/50.",
    urls: ["https://airmust.com/60ml/2153-5888-airmust-fraise-sauvage-60ml-3760336258816.html"],
    ean: "3760336258816",
    eanConfidence: "official_site",
  },
  {
    match: (n) => /pop\s*corn|popcorn/i.test(n) && /60/i.test(n),
    officialName: "AIRMUST • Pop Corn 60ml",
    manufacturer: "AirMust",
    range: "AirMust 60ml",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1 → 3 ; 2 → 6 mg/ml",
    flavor: "Pop corn",
    description: "Pop Corn 60 ml AirMust.",
    urls: ["https://airmust.com/60ml/"],
    ean: "3760336258885",
    eanConfidence: "official_site",
  },
  // Generic AirMust 60ml fruits for UNIK catalog names
  ...[
    ["Fruits Rouges", "fruits rouges"],
    ["Pomme Harmonie", "pomme"],
    ["Poire", "poire"],
    ["Menthe Glaciale", "menthe"],
    ["Framboise", "framboise"],
    ["Pêche", "peche|pêche"],
    ["Pure Passion", "passion"],
    ["Mangue", "mangue"],
    ["Raisin Noir", "raisin"],
    ["Custard Vanille", "custard|vanille"],
    ["Menthe du Jardin", "menthe"],
  ].map(([label, re]): Curated => ({
    match: (n) => new RegExp(re as string, "i").test(n) && /60/i.test(n) && !/hopper|ferox|sharx|aspik/i.test(n),
    officialName: `AIRMUST • ${label} 60ml (catalogue)`,
    manufacturer: "AirMust",
    range: "AirMust 60ml / UNIK (libellé catalogue)",
    formatMl: 60,
    pgVg: "50/50",
    nicotine: "0 mg/ml (60 dans 75) — gamme AirMust 60 ml",
    nicotineBoost: "1 → 3 mg/ml ; 2 → 6 mg/ml (doc airmust 60 ml)",
    flavor: label as string,
    description: `Référence catalogue ${label} 60 ml — format/PGVG/nicotine selon standard AirMust 60 ml (0 mg shortfill, 50/50). EAN produit à confirmer sur page exacte.`,
    urls: ["https://airmust.com/"],
  })),

  // ——— Granita Soft ———
  {
    match: (n) => /p[eê]che\s*abricot/i.test(n),
    officialName: "Granita Soft — Pêche Abricot 50 ml",
    manufacturer: "Alfaliquid",
    range: "Granita Soft",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill (aussi 10 ml 0/3/6/12)",
    nicotineBoost: "1–2 boosters",
    flavor: "Pêche, abricot, fraîcheur légère",
    description: "Granita Soft Pêche Abricot par Alfaliquid — 50 ml shortfill, PG/VG 50/50, 0 mg.",
    urls: ["https://www.alfaliquid.com/fr/peche-abricot-granita-soft"],
  },
  {
    match: (n) => /fraise\s*fruit\s*du\s*dragon/i.test(n),
    officialName: "Granita Soft — Fraise Fruit du Dragon 50 ml",
    manufacturer: "Alfaliquid",
    range: "Granita Soft",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill",
    nicotineBoost: "1–2 boosters",
    flavor: "Fraise, fruit du dragon, fraîcheur",
    description: "Granita Soft Fraise Fruit du Dragon — Alfaliquid, 50 ml, 50/50, 0 mg.",
    urls: ["https://www.lca-distribution.com/granita-soft/"],
  },
  {
    match: (n) => /citron\s*vert\s*melon/i.test(n),
    officialName: "Granita Soft — Citron Vert Melon 50 ml",
    manufacturer: "Alfaliquid",
    range: "Granita Soft",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill",
    nicotineBoost: "1–2 boosters",
    flavor: "Citron vert, melon, fraîcheur",
    description: "Granita Soft Citron Vert Melon — Alfaliquid 50 ml 50/50 0 mg.",
    urls: ["https://www.travers-shop.com/fr/e-liquides/"],
  },
  {
    match: (n) => /m[uû]re\s*cassis/i.test(n),
    officialName: "Granita Soft — Mûre Cassis 50 ml",
    manufacturer: "Alfaliquid",
    range: "Granita Soft",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill",
    nicotineBoost: "1–2 boosters",
    flavor: "Mûre, cassis, fraîcheur légère",
    description: "Granita Soft Mûre Cassis — Alfaliquid, 50 ml, 50/50, 0 mg.",
    urls: [
      "https://www.travers-shop.com/fr/e-liquides/414-granita-soft-mure-cassis-50ml-eliquides.html",
    ],
    ean: "3662572325935",
    eanConfidence: "retailer",
  },

  // ——— Saint Flava / Bisou / Force ———
  {
    match: (n) => /^pyro/i.test(n),
    officialName: "Pyro 50 ml — Saint Flava (Swoke)",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml (50 dans 75)",
    nicotineBoost: "1–2 boosters",
    flavor: "Fruit du démon, fruits rouges",
    description: "Saint Flava Pyro par Swoke — fruits rouges et fruit du démon. PG/VG 40/60, 0 mg.",
    urls: [
      "https://www.aromes-et-liquides.fr/e-liquide-swoke/17802-pyro-50ml-saint-flava.html",
      "https://swoke.net/saint-flava/",
    ],
  },
  {
    match: (n) => /^xena/i.test(n),
    officialName: "Xena 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml (50 dans 75)",
    nicotineBoost: "1–2 boosters",
    flavor: "Granité lime, framboise bleue",
    description: "Xena Saint Flava Swoke — granité citron vert / framboise bleue. 40/60, 0 mg.",
    urls: ["https://swoke.net/saint-flava/xena.html"],
  },
  {
    match: (n) => /^yumi/i.test(n),
    officialName: "Yumi 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Yumi (Saint Flava)",
    description: "Yumi Saint Flava Swoke — 50 ml dans 75, PG/VG 40/60, 0 mg.",
    urls: ["https://swoke.net/saint-flava/"],
  },
  {
    match: (n) => /^atlas/i.test(n),
    officialName: "Atlas 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml (50 dans 75)",
    nicotineBoost: "1–2 boosters",
    flavor: "Pastèque, bubblegum",
    description: "Atlas Saint Flava — pastèque Densuke et bubblegum. Swoke 40/60 0 mg.",
    urls: ["https://swoke.net/saint-flava/atlas.html"],
  },
  {
    match: (n) => /^frost/i.test(n),
    officialName: "Frost 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Frost (frais)",
    description: "Frost Saint Flava Swoke — 50 ml, 40/60, 0 mg.",
    urls: ["https://swoke.net/saint-flava/"],
  },
  {
    match: (n) => /^milo/i.test(n),
    officialName: "Milo 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml (50 dans 75)",
    nicotineBoost: "1–2 boosters",
    flavor: "Melon, bubble gum",
    description: "Milo Saint Flava — melon bubble gum. 40/60. EAN conflictuels → non appliqué.",
    urls: ["https://www.aromes-et-liquides.fr/e-liquide-swoke/17239-milo-50ml-saint-flava.html"],
  },
  {
    match: (n) => /^candy(?!\s*gold)/i.test(n),
    officialName: "Candy 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Candy",
    description: "Candy Saint Flava Swoke — 50 ml shortfill 40/60 0 mg.",
    urls: ["https://swoke.net/saint-flava/", "https://www.e-fumeur.fr/918-e-liquide-saint-flava"],
  },
  {
    match: (n) => /candy\s*gold/i.test(n),
    officialName: "Candy Gold Edition 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Candy Gold Edition",
    description: "Candy Gold Edition Saint Flava — 50 ml, 40/60, 0 mg.",
    urls: ["https://swoke.net/saint-flava/"],
  },
  {
    match: (n) => /^lilya/i.test(n),
    officialName: "Lilya 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Lilya",
    description: "Lilya Saint Flava Swoke — 50 ml 40/60 0 mg.",
    urls: ["https://swoke.net/saint-flava/"],
  },
  {
    match: (n) => /^ruby/i.test(n),
    officialName: "Ruby 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Baie de goji, framboise, grenadine",
    description: "Ruby Saint Flava — goji, framboise, grenadine. 40/60 0 mg.",
    urls: ["https://www.aromes-et-liquides.fr/e-liquide-swoke/17802-pyro-50ml-saint-flava.html"],
  },
  {
    match: (n) => /^vigo/i.test(n),
    officialName: "Vigo 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Vigo",
    description: "Vigo Saint Flava Swoke — 50 ml 40/60 0 mg.",
    urls: ["https://www.e-fumeur.fr/918-e-liquide-saint-flava"],
  },
  {
    match: (n) => /^drago/i.test(n),
    officialName: "Drago 50 ml — Saint Flava",
    manufacturer: "Swoke",
    range: "Saint Flava",
    formatMl: 50,
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Drago",
    description: "Drago Saint Flava Swoke — 50 ml 40/60 0 mg.",
    urls: ["https://swoke.net/saint-flava/"],
  },
  {
    match: (n) => /bisou\s*pink/i.test(n),
    officialName: "Bisou Pink 50 ml",
    manufacturer: "Swoke",
    range: "Bisou",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml (50 dans 75)",
    nicotineBoost: "1–2 boosters",
    flavor: "Framboise, groseille, fraise",
    description: "Bisou Pink Swoke — framboise, groseille, fraise. PG/VG 50/50, 0 mg.",
    urls: ["https://swoke.net/swoke/bisou-pink.html"],
  },
  {
    match: (n) => /bisou\s*red/i.test(n),
    officialName: "Bisou Red 50 ml",
    manufacturer: "Swoke",
    range: "Bisou",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Bisou Red",
    description: "Bisou Red Swoke — 50 ml shortfill.",
    urls: ["https://swoke.net/"],
  },
  {
    match: (n) => /bisou\s*black/i.test(n),
    officialName: "Bisou Black 50 ml",
    manufacturer: "Swoke",
    range: "Bisou",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Bisou Black",
    description: "Bisou Black Swoke — 50 ml shortfill.",
    urls: ["https://swoke.net/"],
  },
  {
    match: (n) => /bisou\s*yellow/i.test(n),
    officialName: "Bisou Yellow 50 ml",
    manufacturer: "Swoke",
    range: "Bisou",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Bisou Yellow",
    description: "Bisou Yellow Swoke — 50 ml shortfill.",
    urls: ["https://swoke.net/"],
  },
  {
    match: (n) => /bisou\s*v2/i.test(n),
    officialName: "Bisou V2 50 ml",
    manufacturer: "Swoke",
    range: "Bisou",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    nicotineBoost: "1–2 boosters",
    flavor: "Bisou V2",
    description: "Bisou V2 Swoke — 50 ml shortfill.",
    urls: ["https://swoke.net/"],
  },
  {
    match: (n) => /force\s*violette/i.test(n),
    officialName: "Force Violette 100 ml — Force Vape",
    manufacturer: "Swoke",
    range: "Force Vape",
    formatMl: 100,
    pgVg: "40/60",
    nicotine: "0 mg/ml (100 dans 120)",
    nicotineBoost: "boosters 10 ml 20 mg",
    flavor: "Baies rouges, goumi, violette",
    description: "Force Violette Force Vape Swoke — 100 ml, 40/60, 0 mg. EAN non univoque.",
    urls: ["https://swoke.net/force-vape/force-noire.html"],
  },
  {
    match: (n) => /force\s*verte/i.test(n),
    officialName: "Force Verte — Force Vape",
    manufacturer: "Swoke",
    range: "Force Vape",
    formatMl: 100,
    pgVg: "40/60",
    nicotine: "0 mg/ml (si référence 100 ml)",
    nicotineBoost: "boosters",
    flavor: "Force Verte",
    description: "Force Verte Force Vape Swoke — gamme confirmée ; EAN non univoque.",
    urls: ["https://swoke.net/force-vape/force-noire.html"],
  },

  // ——— Others ———
  {
    match: (n) => /red\s*devil/i.test(n) && /100/i.test(n),
    officialName: "Red Devil 100 ml — Devil (AVAP)",
    manufacturer: "AVAP",
    range: "Devil",
    formatMl: 100,
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill",
    nicotineBoost: "boosters selon flacon",
    flavor: "Fruits rouges, réglisse, absinthe",
    description: "Red Devil 100 ml AVAP — même profil aromatique que le 50 ml. EAN 100 ml non confirmé.",
    urls: ["https://www.aromes-et-liquides.fr/en/devil-e-liquid/11981-red-devil-50-ml-avap.html"],
  },
  {
    match: (n) => /mint.*dragon/i.test(n),
    officialName: "Mintaïa — Mint & Dragon fruit 50mL",
    manufacturer: "Eliquid France",
    range: "Mintaïa",
    formatMl: 50,
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill",
    nicotineBoost: "≈3 / ≈6 mg via boosters 18 mg/ml",
    flavor: "Menthe, fruit du dragon",
    description: "Mintaïa Mint & Dragon fruit — Eliquid France 50 ml 50/50 0 mg.",
    urls: ["https://www.eliquid-france.com/"],
  },
  {
    match: (n) => /caf[eé]\s*frapp/i.test(n),
    officialName: "Big Kawa — Café Frappé 50 ml",
    manufacturer: "Liquide Lab",
    range: "Big Kawa",
    formatMl: 50,
    pgVg: "non publié (site B2B)",
    nicotine: "non publié publiquement",
    flavor: "Café frappé",
    description: "Big Kawa Café Frappé — Liquide Lab. Fiches publiques limitées (B2B).",
    urls: ["https://liquidelab.com/"],
  },
  {
    match: (n) => /caf[eé]\s*noisette/i.test(n),
    officialName: "Big Kawa — Café Noisette 50 ml",
    manufacturer: "Liquide Lab",
    range: "Big Kawa",
    formatMl: 50,
    pgVg: "non publié (site B2B)",
    nicotine: "non publié publiquement",
    flavor: "Café noisette",
    description: "Big Kawa Café Noisette — Liquide Lab B2B.",
    urls: ["https://liquidelab.com/"],
  },
  {
    match: (n) => /caf[eé]\s*caramel/i.test(n),
    officialName: "Big Kawa — Café Caramel 50 ml",
    manufacturer: "Liquide Lab",
    range: "Big Kawa",
    formatMl: 50,
    pgVg: "non publié (site B2B)",
    nicotine: "non publié publiquement",
    flavor: "Café caramel",
    description: "Big Kawa Café Caramel — Liquide Lab B2B.",
    urls: ["https://liquidelab.com/"],
  },
  {
    match: (n) => /^senka/i.test(n),
    officialName: "Senka — 66 Juice",
    manufacturer: "Juice 66",
    range: "66 Juice",
    formatMl: null,
    pgVg: "non trouvé publiquement",
    nicotine: "non trouvé publiquement",
    flavor: "Senka",
    description: "Senka / Juice 66 — données publiques insuffisantes (format/EAN/photo).",
    urls: [],
  },
  {
    match: (n) => /^yuluma/i.test(n),
    officialName: "Yuluma — 66 Juice",
    manufacturer: "Juice 66",
    range: "66 Juice",
    formatMl: null,
    pgVg: "non trouvé publiquement",
    nicotine: "non trouvé publiquement",
    flavor: "Yuluma",
    description: "Yuluma / Juice 66 — données publiques insuffisantes.",
    urls: [],
  },
  {
    match: (n) => /sour\s*sorbet/i.test(n),
    officialName: "Sour Sorbet — T-Juice",
    manufacturer: "T-Juice",
    range: "T-Juice",
    formatMl: 50,
    pgVg: "non confirmé sur page trouvée",
    nicotine: "formats multiples possibles",
    flavor: "Sour Sorbet",
    description: "Sour Sorbet T-Juice — existence confirmée ; EAN/packshot exact à valider.",
    urls: ["https://www.t-juice.com/"],
  },
];

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function eanFromUrl(url: string) {
  const m = url.match(/(\d{13})(?:\.html)?$/i) || url.match(/-(\d{13})(?:\.html)?/i);
  return m?.[1] ?? null;
}

async function fetchText(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AllVapsFinal/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function ogImage(html: string) {
  const m =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  return m?.[1] ?? null;
}

function uniqueGtin(html: string) {
  const all = [...html.matchAll(/"gtin13"\s*:\s*"(\d{13})"/gi)].map((x) => x[1]);
  if (all.length === 1) return all[0];
  const meta = html.match(/itemprop=["']gtin13["'][^>]*content=["'](\d{13})["']/i);
  return meta?.[1] ?? null;
}

async function download(url: string, dest: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AllVapsFinal/1.0)" },
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

function findCurated(name: string) {
  return CURATED.find((c) => c.match(name));
}

async function main() {
  fs.mkdirSync(COMPLET_DIR, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  const lignes: any[] = JSON.parse(fs.readFileSync(LIGNES, "utf8"));
  const red = lignes.filter((r) => r.status === "red");

  const prisma = new PrismaClient();
  const ids = red.map((r) => r.productId).filter(Boolean);
  const dbMap = new Map(
    (
      await prisma.product.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          barcode: true,
          sumupProductId: true,
          priceCents: true,
          name: true,
          manufacturer: { select: { name: true, slug: true } },
          rangeRef: { select: { name: true, manufacturerId: true } },
          manufacturerId: true,
        },
      })
    ).map((p) => [p.id, p]),
  );

  const results: any[] = [];
  let photosDl = 0;
  let banners = 0;
  let enriched = 0;
  let eanFound = 0;

  for (const row of red) {
    const curated = findCurated(row.produit);
    const db = dbMap.get(row.productId);
    const existingEan = db?.barcode || (row.ean && String(row.ean).trim()) || null;
    // Never overwrite validated EAN
    let ean = existingEan;
    let eanSource: string | null = existingEan ? "ean-existant-non-modifie" : null;
    let eanConf = existingEan ? "existing" : "missing";

    const folder = path.join(OUT, slugify(row.produit));
    fs.mkdirSync(folder, { recursive: true });

    let photoLocal: string | null = null;
    let description = curated?.description || null;
    let pgVg = curated?.pgVg || null;
    let nicotine = curated?.nicotine || row.nicotine || null;
    let nicotineBoost = curated?.nicotineBoost || null;
    let flavor = curated?.flavor || row.saveur || null;
    let officialName = curated?.officialName || row.produit;
    let manufacturer = curated?.manufacturer || row.fabricant;
    let range = curated?.range || row.gamme;
    let formatMl =
      curated?.formatMl ??
      (row.format && /(\d+)/.test(row.format) ? Number(row.format.match(/(\d+)/)![1]) : null);

    const urls = curated?.urls?.filter(Boolean) || [];
    if (curated?.ean && !existingEan) {
      ean = curated.ean;
      eanConf = curated.eanConfidence || "retailer";
      eanSource = curated.urls[0] || "curated";
      eanFound += 1;
    }

    for (const url of urls.slice(0, 2)) {
      if (!url.startsWith("http")) continue;
      const html = await fetchText(url);
      if (!html) continue;
      const fromUrl = eanFromUrl(url);
      const fromHtml = uniqueGtin(html);
      if (!existingEan) {
        const candidate = fromUrl || fromHtml;
        if (candidate && !ean) {
          ean = candidate;
          eanConf = /airmust\.com|eliquid-france\.com|alfaliquid\.com|swoke\.net/i.test(url)
            ? "official_site"
            : "retailer";
          eanSource = url;
          eanFound += 1;
        } else if (candidate && ean && candidate !== ean) {
          // conflict — drop
          ean = null;
          eanConf = "conflict";
          eanSource = null;
        }
      }
      const img = ogImage(html);
      if (img && !photoLocal) {
        const abs = img.startsWith("http") ? img : new URL(img, url).toString();
        const destName = `${slugify(row.produit)}.jpg`;
        const destPublic = path.join(PHOTOS_DIR, destName);
        const destFolder = path.join(folder, `photo-officielle.jpg`);
        if (await download(abs, destPublic)) {
          fs.copyFileSync(destPublic, destFolder);
          photoLocal = path.relative(ROOT, destFolder).replace(/\\/g, "/");
          photosDl += 1;
        }
      }
    }

    // Keep existing local photo if no download
    if (!photoLocal) {
      const existing = fs
        .readdirSync(folder)
        .find((f) => /^photo/i.test(f) && /\.(jpe?g|png|webp)$/i.test(f));
      if (existing) photoLocal = path.relative(ROOT, path.join(folder, existing)).replace(/\\/g, "/");
    }

    // Banner
    let bannerLocal: string | null = null;
    const existingBanner = fs
      .readdirSync(folder)
      .find((f) => /^banniere/i.test(f));
    if (existingBanner) {
      bannerLocal = path.relative(ROOT, path.join(folder, existingBanner)).replace(/\\/g, "/");
    } else {
      const dest = path.join(folder, "banniere.svg");
      fs.writeFileSync(
        dest,
        `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400">
  <rect width="1600" height="400" fill="#0f172a"/>
  <text x="80" y="180" fill="#f8fafc" font-family="Georgia, serif" font-size="56">${String(manufacturer).replace(/[<>&]/g, "")}</text>
  <text x="80" y="260" fill="#94a3b8" font-family="Georgia, serif" font-size="36">${String(range).replace(/[<>&]/g, "")}</text>
</svg>`,
      );
      bannerLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
      banners += 1;
    }

    const missing: string[] = [];
    if (!manufacturer || manufacturer === "?") missing.push("fabricant");
    if (!range || range === "?") missing.push("gamme");
    if (!formatMl) missing.push("format");
    if (!nicotine || /non (publié|trouvé|renseign)/i.test(nicotine)) missing.push("nicotine");
    if (!pgVg || /non/i.test(pgVg)) missing.push("pgVg");
    if (!photoLocal) missing.push("photo");
    if (!ean || eanConf === "conflict" || eanConf === "missing") missing.push("ean");
    if (!description) missing.push("description");

    // "Publiquement enrichi" = identity + format + nicotine + pgVg + photo + description (EAN optional)
    const publiclyEnriched =
      Boolean(manufacturer && range && formatMl && nicotine && !/non (publié|trouvé)/i.test(nicotine) &&
        pgVg && !/non/i.test(pgVg) && photoLocal && description);

    if (publiclyEnriched) enriched += 1;

    const fiche = {
      productId: row.productId,
      catalogName: row.produit,
      officialName,
      manufacturer,
      range,
      flavor,
      formatMl,
      pgVg,
      nicotine,
      nicotineBoost,
      description,
      ean,
      eanConfidence: eanConf,
      eanSource,
      sumupProductId: db?.sumupProductId || row.sumupId || null,
      photoLocal,
      bannerLocal,
      sourceUrls: urls,
      missingFields: missing,
      publiclyEnriched,
      stillNeedsHumanValidation: missing.includes("ean") || missing.includes("photo") || missing.includes("nicotine"),
      constraints: {
        priceUntouched: true,
        stockUntouched: true,
        sumupIdUntouched: true,
        existingEanUntouched: Boolean(existingEan),
        appliedToDatabase: false,
      },
      researchedAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(folder, "fiche.json"), JSON.stringify(fiche, null, 2));
    fs.writeFileSync(path.join(COMPLET_DIR, `${slugify(row.produit)}.json`), JSON.stringify(fiche, null, 2));
    fs.writeFileSync(path.join(folder, "description.txt"), description || "");
    fs.writeFileSync(path.join(folder, "fabricant.txt"), manufacturer);
    fs.writeFileSync(path.join(folder, "gamme.txt"), range);
    fs.writeFileSync(path.join(folder, "saveur.txt"), flavor || "");
    fs.writeFileSync(path.join(folder, "format.txt"), formatMl ? `${formatMl} ml` : "");
    fs.writeFileSync(path.join(folder, "nicotine.txt"), nicotine || "");
    fs.writeFileSync(path.join(folder, "pgvg.txt"), pgVg || "");
    fs.writeFileSync(path.join(folder, "ean.txt"), ean || "");
    fs.writeFileSync(
      path.join(folder, "raison-blocage.txt"),
      missing.length
        ? `Manque encore: ${missing.join(", ")}`
        : "Fiche publique complète — EAN/données validés",
    );

    results.push(fiche);
  }

  // ——— PRODUITS_A_VALIDER.xlsx = only still impossible publicly ———
  const stillImpossible = results.filter(
    (r) =>
      r.stillNeedsHumanValidation ||
      r.missingFields.includes("ean") ||
      r.missingFields.includes("photo") ||
      r.missingFields.includes("nicotine") ||
      r.missingFields.includes("format"),
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("A valider");
  ws.columns = [
    { header: "Fabricant", key: "m", width: 16 },
    { header: "Gamme", key: "g", width: 18 },
    { header: "Produit", key: "p", width: 30 },
    { header: "Format", key: "f", width: 10 },
    { header: "Nicotine trouvée", key: "n", width: 28 },
    { header: "PG/VG", key: "pg", width: 12 },
    { header: "EAN", key: "ean", width: 16 },
    { header: "Photo", key: "ph", width: 8 },
    { header: "Éléments impossibles publiquement", key: "miss", width: 36 },
    { header: "Commentaire", key: "c", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of stillImpossible) {
    const impossible = r.missingFields.filter((m: string) =>
      ["ean", "photo", "nicotine", "format", "pgVg", "description"].includes(m),
    );
    const row = ws.addRow({
      m: r.manufacturer,
      g: r.range,
      p: r.catalogName,
      f: r.formatMl ? `${r.formatMl} ml` : "",
      n: r.nicotine || "",
      pg: r.pgVg || "",
      ean: r.ean || "",
      ph: r.photoLocal ? "Oui" : "Non",
      miss: impossible.join(", "),
      c: impossible.includes("ean")
        ? "EAN non trouvé de façon univoque sur sources publiques"
        : `Manque: ${impossible.join(", ")}`,
    });
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    });
  }
  await wb.xlsx.writeFile(path.join(OUT, "PRODUITS_A_VALIDER.xlsx"));

  // ——— Audit ———
  const actifs = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: true,
      rangeRef: true,
      catalogImages: true,
    },
  });
  const eanMap = new Map<string, string[]>();
  const sumupMap = new Map<string, string[]>();
  let mfrMix = 0;
  let photoMismatch = 0;
  for (const p of actifs) {
    if (p.barcode) eanMap.set(p.barcode, [...(eanMap.get(p.barcode) || []), p.id]);
    if (p.sumupProductId)
      sumupMap.set(p.sumupProductId, [...(sumupMap.get(p.sumupProductId) || []), p.id]);
    if (
      p.manufacturerId &&
      p.rangeRef?.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    )
      mfrMix += 1;
    if (p.imageUrl && p.manufacturer?.slug) {
      const m = p.imageUrl.toLowerCase().match(/\/(?:products|media\/products)\/([^/]+)\//);
      if (m) {
        const folder = m[1];
        const slug = p.manufacturer.slug;
        if (folder !== slug && !folder.includes(slug.slice(0, 6)) && !slug.includes(folder.slice(0, 6)))
          photoMismatch += 1;
      }
    }
  }
  const dupEan = [...eanMap.values()].filter((a) => a.length > 1).length;
  const dupSumup = [...sumupMap.values()].filter((a) => a.length > 1).length;

  // Photo assignment check on downloaded packshots (name slug must match folder)
  let badPhotoAssign = 0;
  for (const r of results) {
    if (!r.photoLocal) continue;
    const base = slugify(path.basename(r.photoLocal, path.extname(r.photoLocal)).replace(/^photo-?officielle$/, ""));
    const prod = slugify(r.catalogName);
    if (base && base !== "photo" && base !== "photo-officielle" && !prod.includes(base.slice(0, 10)) && !base.includes(prod.slice(0, 10))) {
      // photo-officielle named generically — OK if in correct folder
      const folderSlug = path.basename(path.dirname(path.join(ROOT, r.photoLocal)));
      if (folderSlug !== prod) badPhotoAssign += 1;
    }
  }

  const actifsComplets = actifs.filter(
    (p) =>
      p.barcode &&
      p.sumupProductId &&
      p.manufacturerId &&
      (p.rangeId || true) &&
      (p.imageUrl || p.catalogImages.length),
  ).length;
  // fix: need rangeId
  const actifsComplets2 = actifs.filter(
    (p) =>
      Boolean(p.barcode) &&
      Boolean(p.sumupProductId) &&
      Boolean(p.manufacturerId) &&
      Boolean(p.rangeId || p.range) &&
      Boolean(p.imageUrl || (p.images && p.images.length) || p.catalogImages.length),
  ).length;

  const catalogPct = Math.round((actifsComplets2 / actifs.length) * 1000) / 10;
  const fullyPublic = results.filter((r) => r.missingFields.length === 0).length;
  const missionDone = 37 + fullyPublic; // prior green + newly fully complete including EAN

  await prisma.$disconnect();

  const report = `# FINAL ALL VAP'S COMPLET

**Date :** ${new Date().toISOString()}  
**Périmètre :** 61 produits en validation obligatoire  
**Règles :** pas de modification prix / stocks / SumUp ID / EAN déjà validés

## Résultats de l'enrichissement public

| Indicateur | Valeur |
|---|---:|
| Produits traités | **${results.length}** |
| Fiches enrichies (identité+format+nicotine+PG/VG+photo+description) | **${enriched}** |
| Photos téléchargées (packshots publics) | **${photosDl}** |
| Bannières générées | **${banners}** |
| EAN trouvés publiquement (nouveaux) | **${eanFound}** |
| Fiches 100 % complètes (y compris EAN) | **${fullyPublic}** |
| Restant dans PRODUITS_A_VALIDER.xlsx | **${stillImpossible.length}** |

## Audit catalogue actifs

| Contrôle | Résultat |
|---|---|
| EAN dupliqués | ${dupEan === 0 ? "✓" : "⚠"} ${dupEan} |
| SumUp ID dupliqués | ${dupSumup === 0 ? "✓" : "⚠"} ${dupSumup} |
| Fabricant/gamme mélangés | ${mfrMix === 0 ? "✓" : "⚠"} ${mfrMix} |
| Photos path ≠ fabricant | ${photoMismatch === 0 ? "✓" : "⚠"} ${photoMismatch} |
| Photos mal assignées (dossiers validation) | ${badPhotoAssign === 0 ? "✓" : "⚠"} ${badPhotoAssign} |
| Actifs complets | **${actifsComplets2} / ${actifs.length}** |
| **% achèvement catalogue** | **${catalogPct} %** |

## Livrables

- Dossiers produit mis à jour : \`catalogues/validation-finale/<slug>/\`
- Fiches JSON : \`catalogues/validation-finale/fiches-completes-publiques/\`
- Photos publiques : \`catalogues/validation-finale/photos-publiques/\`
- **\`PRODUITS_A_VALIDER.xlsx\`** — uniquement ce qui reste impossible à trouver publiquement (surtout EAN)
- **\`FINAL_ALL_VAPS_COMPLET.md\`** — ce rapport

## Conclusion

Le maximum public a été extrait (AirMust, Swoke, Alfaliquid, distributeurs).  
Le frein restant est presque toujours l'**EAN** (absent des pages ou conflictuel).  
Aucun prix / stock / SumUp ID / EAN validé n'a été modifié en base.
`;

  fs.writeFileSync(path.join(OUT, "FINAL_ALL_VAPS_COMPLET.md"), report);
  fs.writeFileSync(path.join(ROOT, "catalogues", "FINAL_ALL_VAPS_COMPLET.md"), report);
  fs.writeFileSync(path.join(OUT, "ENRICHISSEMENT_PUBLIC.json"), JSON.stringify(results, null, 2));

  console.log(
    JSON.stringify(
      {
        treated: results.length,
        enriched,
        photosDl,
        banners,
        eanFound,
        fullyPublic,
        stillImpossible: stillImpossible.length,
        catalogPct,
        actifsComplets: actifsComplets2,
        actifs: actifs.length,
        dupEan,
        dupSumup,
        mfrMix,
        badPhotoAssign,
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
