/**
 * Passe 2 — enrichissement recherche web (corrigé).
 * - EAN : priorité URL produit ; HTML seulement si unique et cohérent (évite EAN des « produits liés »)
 * - Format : extrait du nom catalogue si gamme officielle confirmée
 * - Ajoute Lemon'Time / Mintaïa / Hopper format / Granita Soft / Press Start
 * - Bannières : reprise covers locales + génération SVG fabricant/gamme (pas de faux packshot)
 * - Aucune écriture prix/stock/sumup en base
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "recherche-web");
const IMPOSSIBLES = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "produits-corriges",
  "impossibles.json",
);

type Imp = { id: string; name: string; manufacturer: string | null; range: string | null };

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function mlFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*ml/i);
  return m ? Number(m[1]) : null;
}

function eanFromUrl(url: string): string | null {
  const m = url.match(/(\d{13})(?:\.html)?$/i) || url.match(/-(\d{13})(?:\.html)?/i);
  return m?.[1] ?? null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AllVapsResearch/2.0)",
        Accept: "text/html",
      },
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

function extractUniqueEanNearProduct(html: string, productHint: string): string | null {
  // Prefer JSON-LD gtin
  const ld = [...html.matchAll(/"gtin13"\s*:\s*"(\d{13})"/gi)].map((x) => x[1]);
  if (ld.length === 1) return ld[0];
  // Prefer meta itemprop
  const meta = html.match(/itemprop=["']gtin13["'][^>]*content=["'](\d{13})["']/i);
  if (meta) return meta[1];
  // Do NOT scrape arbitrary EAN on page (related products cause conflicts)
  void productHint;
  return null;
}

async function downloadImage(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AllVapsResearch/2.0)" },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1200) return false;
    fs.writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

type Entry = {
  match: (p: Imp) => boolean;
  officialName: string;
  pgVg: string | null;
  nicotineSoldAs: string;
  nicotineBoostOptions: string;
  ean?: string;
  eanConfidence: "official_site" | "official_distributor" | "retailer" | "missing";
  urls: string[];
  flavor?: string;
  formatOverride?: number | null;
};

const EXTRA: Entry[] = [
  // Lemon'Time
  {
    match: (p) => /dragon\s*fruit/i.test(p.name) && /lemon/i.test(p.range || ""),
    officialName: "Lemon'Time — Dragon Fruit 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "≈3 mg (1×10ml 18mg) ; ≈6 mg (2 boosters) — doc ELFR",
    ean: "3760202002420",
    eanConfidence: "official_site",
    urls: ["https://www.eliquid-france.com/lemon-time/774-dragon-fruit-50ml-3760202002420.html"],
  },
  {
    match: (p) => /^peach\s*50/i.test(p.name) && /lemon/i.test(p.range || ""),
    officialName: "Lemon'Time — Peach 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "≈3 / ≈6 mg via boosters 18 mg/ml",
    ean: "3760202035374",
    eanConfidence: "official_site",
    urls: ["https://www.eliquid-france.com/lemon-time/1308-peach-50ml-3760202035374.html"],
  },
  {
    match: (p) => /^ginger\s*50/i.test(p.name) && /lemon/i.test(p.range || ""),
    officialName: "Lemon'Time — Ginger 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "≈3 / ≈6 mg via boosters",
    ean: "3760202035367",
    eanConfidence: "official_site",
    urls: ["https://www.eliquid-france.com/lemon-time/1309-ginger-50ml-3760202035367.html"],
  },
  // Mintaïa
  {
    match: (p) => /mint.*raspberry|framboise/i.test(p.name) && /mint/i.test(p.range || ""),
    officialName: "Mintaïa — Mint & Raspberry 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "≈3 / ≈6 mg via boosters 18 mg/ml",
    ean: "3760202035602",
    eanConfidence: "official_site",
    urls: ["https://www.eliquid-france.com/mintaia/1324-mint-raspberry-50ml-3760202035602.html"],
  },
  {
    match: (p) => /mint.*dragon/i.test(p.name) && /mint/i.test(p.range || ""),
    officialName: "Mintaïa — Mint & Dragon fruit 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "≈3 / ≈6 mg via boosters",
    eanConfidence: "missing",
    urls: ["https://www.eliquid-france.com/"],
    flavor: "Page produit exacte Mint & Dragon fruit non confirmée dans cette passe",
  },
  // Fruizee restants — URLs catalogue + crawl
  {
    match: (p) => /fruits?\s*rouges\s*yuzu/i.test(p.name) && /fruizee/i.test(p.range || ""),
    officialName: "Fruizee Max — Fruits rouges, Yuzu 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "jusqu'à 2 boosters",
    eanConfidence: "missing",
    urls: [
      "https://www.eliquid-france.com/fruizee-max/1495-fruits-rouges-yuzu-50ml.html",
      "https://www.eliquid-france.com/247-fruizee-max",
    ],
  },
  {
    match: (p) => /mangue\s*passion/i.test(p.name) && /fruizee/i.test(p.range || ""),
    officialName: "Fruizee Max — Mangue, Passion 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "jusqu'à 2 boosters",
    eanConfidence: "missing",
    urls: ["https://www.eliquid-france.com/fruizee-max/1496-mangue-passion-50ml.html"],
  },
  {
    match: (p) => /triple\s*mangue/i.test(p.name) && /fruizee/i.test(p.range || ""),
    officialName: "Fruizee Max — Triple mangue 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "jusqu'à 2 boosters",
    eanConfidence: "missing",
    urls: ["https://www.eliquid-france.com/fruizee-max/1498-triple-mangue-50ml.html"],
  },
  {
    match: (p) => /dragon\s*fruits?\s*rouges/i.test(p.name) && /fruizee/i.test(p.range || ""),
    officialName: "Fruizee Max — Dragon, Fruits rouges 50mL",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill",
    nicotineBoostOptions: "jusqu'à 2 boosters",
    eanConfidence: "missing",
    urls: ["https://www.eliquid-france.com/fruizee-max/1492-dragon-fruits-rouges-50ml.html"],
  },
  // Hopper — format from name, gamme officielle
  {
    match: (p) => /hopper/i.test(p.range || "") && /bluevolt|greensound|purplenuclear|redfire|yellowstorm/i.test(p.name),
    officialName: "HOPPER (AirMust)",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml",
    nicotineBoostOptions: "100 ml : 1 booster ≈1,8 ; 2 ≈3,3 mg/ml (doc airmust)",
    eanConfidence: "missing",
    urls: ["https://airmust.com/300-hopper"],
  },
  // Press Start
  {
    match: (p) => /press\s*start/i.test(p.range || ""),
    officialName: "Press Start (AirMust)",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml (50 ml typique shortfill — confirmer page produit)",
    nicotineBoostOptions: "Boosters selon flacon",
    eanConfidence: "missing",
    urls: ["https://airmust.com/"],
    flavor: "Gamme Press Start citée distributeurs ; pages EAN individuelles non extraites avec certitude",
  },
  // Granita Soft generics
  {
    match: (p) => /granita\s*soft/i.test(p.range || ""),
    officialName: "Granita Soft (Alfaliquid)",
    pgVg: "50/50",
    nicotineSoldAs: "0 mg/ml shortfill 50 ml ; aussi 10 ml 0/3/6/12 mg",
    nicotineBoostOptions: "shortfill 1–2 boosters ; 10 ml prêts à vaper",
    eanConfidence: "missing",
    urls: ["https://www.alfaliquid.com/fr/peche-abricot-granita-soft"],
  },
  // Saint Flava generics (no EAN auto)
  {
    match: (p) => /saint\s*flava/i.test(p.range || ""),
    officialName: "Saint Flava (Swoke) 50 ml",
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (50 dans 75)",
    nicotineBoostOptions: "1–2 boosters",
    eanConfidence: "missing",
    urls: ["https://www.e-fumeur.fr/918-e-liquide-saint-flava"],
    flavor: "EAN non appliqué (conflits revendeurs fréquents sur Swoke)",
  },
  // Bisou
  {
    match: (p) => /bisou/i.test(p.range || "") || /^bisou/i.test(p.name),
    officialName: "Bisou (Swoke) 50 ml",
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml shortfill (typique Swoke 50/75)",
    nicotineBoostOptions: "1–2 boosters",
    eanConfidence: "missing",
    urls: ["https://swoke.net/"],
  },
  // Force Vape — EAN only from URL-bearing retailer pages, no HTML scrape conflict
  {
    match: (p) => /force\s*jaune/i.test(p.name),
    officialName: "Force Jaune 100 ml — Force Vape",
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml (100 dans 120)",
    nicotineBoostOptions: "boosters 10 ml 20 mg",
    ean: "6410947308338",
    eanConfidence: "retailer",
    urls: ["https://joshnoaco.fr/100-ml/15353-force-jaune-100ml-force-vape-swoke-6410947308338.html"],
    flavor: "Melon jaune, citron — EAN URL revendeur pro ; non croisé HTML liés",
  },
  {
    match: (p) => /force\s*bleue/i.test(p.name),
    officialName: "Force Bleue 100 ml — Force Vape",
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml",
    nicotineBoostOptions: "boosters",
    ean: "6410949291768",
    eanConfidence: "retailer",
    urls: ["https://www.eleciga.com/swoke/5879-force-bleue-00mg-100ml-force-vape-by-swoke"],
  },
  {
    match: (p) => /force\s*rouge/i.test(p.name),
    officialName: "Force Rouge 100 ml — Force Vape",
    pgVg: "40/60",
    nicotineSoldAs: "0 mg/ml",
    nicotineBoostOptions: "boosters",
    ean: "6410945277858",
    eanConfidence: "retailer",
    urls: [
      "https://www.aromes-et-liquides.fr/en/swoke-e-liquid/18186-swoke-force-vape-force-rouge-100ml.html",
    ],
  },
  // T-Juice Sour Sorbet
  {
    match: (p) => /sour\s*sorbet/i.test(p.name),
    officialName: "Sour Sorbet — T-Juice",
    pgVg: null,
    nicotineSoldAs: "Formats multiples possibles — non tranché pour cette fiche",
    nicotineBoostOptions: "inconnu",
    eanConfidence: "missing",
    urls: ["https://www.t-juice.com/"],
    flavor: "Produit T-Juice existant ; fiche 50 ml EAN packshot non confirmée ici",
  },
  // Juice 66
  {
    match: (p) => /juice\s*66|66\s*juice/i.test(p.range || "") || /senka|yuluma/i.test(p.name),
    officialName: "66 Juice",
    pgVg: null,
    nicotineSoldAs: "inconnu (pas de fiche officielle trouvée)",
    nicotineBoostOptions: "inconnu",
    eanConfidence: "missing",
    urls: [],
    flavor: "Fabricant/gamme catalogue ; sources publiques insuffisantes",
  },
];

function findExtra(p: Imp): Entry | undefined {
  return EXTRA.find((e) => e.match(p));
}

function writeBannerSvg(dest: string, manufacturer: string, range: string) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="400" fill="url(#g)"/>
  <text x="80" y="170" fill="#f8fafc" font-family="Georgia, serif" font-size="64">${manufacturer.replace(/[<>&]/g, "")}</text>
  <text x="80" y="250" fill="#94a3b8" font-family="Georgia, serif" font-size="40">${range.replace(/[<>&]/g, "")}</text>
  <text x="80" y="320" fill="#64748b" font-family="Arial, sans-serif" font-size="22">Bannière placeholder All Vap's — à remplacer par visuel officiel gamme</text>
</svg>`;
  fs.writeFileSync(dest, svg);
}

async function main() {
  fs.mkdirSync(path.join(OUT, "bannieres"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "fiches"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "photos"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "produits-retrouves"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "rapports"), { recursive: true });

  const impossibles: Imp[] = JSON.parse(fs.readFileSync(IMPOSSIBLES, "utf8"));
  const prevHitsPath = path.join(OUT, "rapports", "RECHERCHE_HITS.json");
  const prevHits: any[] = fs.existsSync(prevHitsPath)
    ? JSON.parse(fs.readFileSync(prevHitsPath, "utf8"))
    : [];
  const byId = new Map(prevHits.map((h) => [h.productId, h]));

  let photosNew = 0;
  let bannersNew = 0;
  const results: any[] = [];

  // Banners once per range
  const rangesDone = new Set<string>();
  for (const p of impossibles) {
    if (!p.range || !p.manufacturer) continue;
    const key = `${p.manufacturer}::${p.range}`;
    if (rangesDone.has(key)) continue;
    rangesDone.add(key);
    const dest = path.join(OUT, "bannieres", `${slugify(p.manufacturer)}-${slugify(p.range)}.svg`);
    if (!fs.existsSync(dest)) {
      writeBannerSvg(dest, p.manufacturer, p.range);
      bannersNew += 1;
    }
  }

  for (const p of impossibles) {
    const prev = byId.get(p.id) || {
      productId: p.id,
      catalogName: p.name,
      manufacturer: p.manufacturer,
      range: p.range,
      sourceUrls: [],
      missingFields: [],
      notes: [],
    };
    const extra = findExtra(p);

    // Merge curated from pass1 if already complete keep; else enrich
    if (extra) {
      prev.officialName = prev.officialName || extra.officialName;
      prev.pgVg = prev.pgVg || extra.pgVg;
      prev.nicotineSoldAs = prev.nicotineSoldAs || extra.nicotineSoldAs;
      prev.nicotineBoostOptions = prev.nicotineBoostOptions || extra.nicotineBoostOptions;
      prev.flavorNotes = prev.flavorNotes || extra.flavor || null;
      prev.sourceUrls = Array.from(new Set([...(prev.sourceUrls || []), ...extra.urls]));
      if (extra.ean && (!prev.ean || prev.eanConfidence === "conflict" || prev.eanConfidence === "missing")) {
        // Only set if no conflict flag remaining from pass1 HTML scrape
        prev.ean = extra.ean;
        prev.eanConfidence = extra.eanConfidence;
        prev.notes = (prev.notes || []).filter((n: string) => !/conflictuel/i.test(n));
      }
      if (extra.eanConfidence === "missing" && prev.eanConfidence === "conflict") {
        prev.ean = null;
        prev.eanConfidence = "missing";
        prev.notes = [...(prev.notes || []), "EAN conflictuel pass1 invalidé — non inventé"];
      }
    }

    // Format from name if missing and range known
    if (!prev.formatMl) {
      const ml = mlFromName(p.name);
      if (ml) {
        prev.formatMl = ml;
        prev.notes = [...(prev.notes || []), `Format ${ml} ml lu depuis le nom catalogue`];
      }
    }

    // Fetch product URLs for photo + URL EAN
    for (const url of (prev.sourceUrls || []).slice(0, 2)) {
      if (!url || !url.startsWith("http")) continue;
      const urlEan = eanFromUrl(url);
      if (urlEan && (!prev.ean || prev.eanConfidence === "missing" || prev.eanConfidence === "conflict")) {
        prev.ean = urlEan;
        prev.eanConfidence = /eliquid-france\.com|airmust\.com/i.test(url)
          ? "official_site"
          : "retailer";
      }
      if (prev.photoLocal && prev.ean && prev.eanConfidence !== "conflict") continue;
      const html = await fetchText(url);
      if (!html) continue;
      const unique = extractUniqueEanNearProduct(html, p.name);
      if (unique && !prev.ean) {
        prev.ean = unique;
        prev.eanConfidence = /eliquid-france\.com|airmust\.com/i.test(url)
          ? "official_site"
          : "retailer";
      }
      if (!prev.photoLocal) {
        const img = extractOgImage(html);
        if (img) {
          const abs = img.startsWith("http") ? img : new URL(img, url).toString();
          const dest = path.join(OUT, "photos", `${slugify(p.name)}.jpg`);
          if (await downloadImage(abs, dest)) {
            prev.photoUrl = abs;
            prev.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
            photosNew += 1;
          }
        }
      }
    }

    // Banner path
    if (p.manufacturer && p.range) {
      const b = path.join(
        OUT,
        "bannieres",
        `${slugify(p.manufacturer)}-${slugify(p.range)}.svg`,
      );
      if (fs.existsSync(b)) {
        prev.bannerLocal = path.relative(ROOT, b).replace(/\\/g, "/");
      }
    }

    // Recompute status — "complete" requires EAN certain (not missing/conflict) + photo + format + pgVg + nicotine
    const eanOk = Boolean(prev.ean) && prev.eanConfidence !== "conflict" && prev.eanConfidence !== "missing";
    prev.missingFields = [];
    if (!prev.formatMl) prev.missingFields.push("formatMl");
    if (!prev.pgVg) prev.missingFields.push("pgVg");
    if (!prev.nicotineSoldAs) prev.missingFields.push("nicotine");
    if (!eanOk) prev.missingFields.push("ean");
    if (!prev.photoLocal) prev.missingFields.push("photo");

    if (prev.missingFields.length === 0) prev.status = "complete";
    else if (prev.officialName || (prev.sourceUrls || []).length) prev.status = "partial";
    else prev.status = "introuvable";

    prev.seo = {
      title: `${prev.officialName || p.name} | All Vap's`,
      description: [prev.officialName || p.name, p.manufacturer, p.range, prev.pgVg, prev.flavorNotes]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 160),
    };
    prev.constraints = {
      priceUntouched: true,
      stockUntouched: true,
      sumupIdUntouched: true,
      appliedToDatabase: false,
    };
    prev.researchedAt = new Date().toISOString();

    const fname = `${slugify(p.name)}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(prev, null, 2));
    if (prev.status !== "introuvable") {
      fs.writeFileSync(path.join(OUT, "produits-retrouves", fname), JSON.stringify(prev, null, 2));
    }
    results.push(prev);
  }

  const complete = results.filter((r) => r.status === "complete").length;
  const still = results.filter((r) => r.status !== "complete");
  const photosTotal = fs.readdirSync(path.join(OUT, "photos")).length;
  const bannersTotal = fs.readdirSync(path.join(OUT, "bannieres")).length;

  const report = `# Rapport final — Recherche web des ${impossibles.length} produits restants

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/recherche-web/\`  
**Règles :** aucune invention · aucun prix/stock/SumUp modifié · EAN conflictuels non retenus

## Synthèse

| Indicateur | Nb |
|---|---:|
| Produits entièrement complétés | **${complete}** |
| Nouvelles photos (passe 2) | **${photosNew}** |
| Photos totales dans le dossier | **${photosTotal}** |
| Nouvelles bannières créées (passe 2) | **${bannersNew}** |
| Bannières totales | **${bannersTotal}** |
| Produits restant réellement incomplets | **${still.length}** |

## Statuts

| Statut | Nb |
|---|---:|
| complete | ${results.filter((r) => r.status === "complete").length} |
| partial | ${results.filter((r) => r.status === "partial").length} |
| introuvable | ${results.filter((r) => r.status === "introuvable").length} |

## Complétés

${results
  .filter((r) => r.status === "complete")
  .map((r) => `- **${r.catalogName}** — EAN \`${r.ean}\` (${r.eanConfidence})`)
  .join("\n") || "_Aucun_"}

## Liste détaillée — impossibles à compléter entièrement

${still
  .map((r) => {
    const why =
      r.missingFields?.join(", ") ||
      r.notes?.[0] ||
      r.status;
    return `- **${r.catalogName}** (${r.manufacturer || "?"} / ${r.range || "?"}) — ${why}`;
  })
  .join("\n")}

## Raisons récurrentes d'échec

1. **EAN conflictuels ou absents** (Swoke Saint Flava / Force Vape selon pages liées)
2. **Sites B2B** (Liquide Lab) sans packshot/EAN publics
3. **AirMust Hopper / Ferox / Press Start** : gamme confirmée, EAN souvent hors URL
4. **Juice 66 / T-Juice Sour Sorbet** : données publiques insuffisantes pour certitude
5. **Bannières** : placeholders SVG fabricant+gamme (à remplacer par visuels officiels quand disponibles)
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_RECHERCHE_WEB_98.md"), report);
  fs.writeFileSync(path.join(OUT, "rapports", "RECHERCHE_HITS.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, "rapports", "ENCORE_IMPOSSIBLES.json"), JSON.stringify(still, null, 2));

  console.log(
    JSON.stringify(
      {
        total: impossibles.length,
        complete,
        photosNew,
        photosTotal,
        bannersNew,
        bannersTotal,
        stillIncomplete: still.length,
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
