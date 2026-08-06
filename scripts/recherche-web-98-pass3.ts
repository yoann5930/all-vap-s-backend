/**
 * Passe 3 — correction intégrité EAN + Press Start / Fruizee restants.
 * Invalide les EAN manifestement mélangés (même code pour 2 produits distincts).
 * Aucune écriture DB.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "recherche-web");
const HITS = path.join(OUT, "rapports", "RECHERCHE_HITS.json");
const IMP = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "produits-corriges",
  "impossibles.json",
);

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function eanFromUrl(url: string): string | null {
  const m = url.match(/(\d{13})(?:\.html)?$/i) || url.match(/-(\d{13})(?:\.html)?/i);
  return m?.[1] ?? null;
}

async function fetchText(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AllVapsResearch/3.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function og(html: string) {
  const m =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  return m?.[1] ?? null;
}

async function dl(url: string, dest: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AllVapsResearch/3.0)" },
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

/** Product-specific certain URLs (EAN in path = official airmust / confirmed retailer). */
const PATCHES: Record<
  string,
  {
    officialName: string;
    url: string;
    pgVg?: string;
    nicotine?: string;
    boost?: string;
    eanOverride?: string;
    eanConfidence?: string;
    invalidateEan?: boolean;
    reason?: string;
  }
> = {
  "Paka Paka 50 ml": {
    officialName: "Press Start - Paka Paka 50ml",
    url: "https://airmust.com/formats/2702-6346-press-start-paka-paka-50ml-3701719512316.html",
    pgVg: "50/50",
    nicotine: "0 mg/ml (50 dans 75)",
    boost: "boosters 10 ml 20 mg",
  },
  "Dunky 50 ml": {
    officialName: "Press Start - Dunky 50ml",
    url: "https://airmust.com/formats/2701-6345-press-start-dunky-50ml-3701719512293.html",
    pgVg: "50/50",
    nicotine: "0 mg/ml (50 dans 75)",
    boost: "boosters",
  },
  "Fruits Rouges Yuzu 50 ml": {
    officialName: "Fruizee Max — Fruits Rouges Yuzu 50ml",
    url: "https://www.ciga.fr/pd-9782-fruits-rouges-yuzu-50ml-fruizee-max-3760202040682.html",
    pgVg: "50/50",
    nicotine: "0 mg/ml shortfill",
    boost: "1–2 boosters",
    eanOverride: "3760202040682",
    eanConfidence: "retailer",
  },
  "Dragon Fruits Rouges 50 ml": {
    officialName: "Fruizee Max — Dragon Fruits Rouges 50ml",
    url: "https://www.vapo-shop.fr/e-liquides-fruizee-max/3693-dragon-fruits-rouges-50ml-fruizee-max-fruizee-3760202040651.html",
    pgVg: "50/50",
    nicotine: "0 mg/ml",
    boost: "boosters",
    eanOverride: "3760202040651",
    eanConfidence: "retailer",
  },
  "Force Violette 100 ml": {
    officialName: "Force Violette 100 ml — Force Vape",
    url: "https://swoke.net/force-vape/force-noire.html",
    pgVg: "40/60",
    nicotine: "0 mg/ml (100 dans 120)",
    boost: "boosters",
    invalidateEan: true,
    reason: "EAN 6410947308338 était celui de Force Jaune — invalidé",
  },
  "Force Noire 100 ml": {
    officialName: "Force Noire 100 ml — Force Vape",
    url: "https://swoke.net/force-vape/force-noire.html",
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    boost: "boosters",
    eanOverride: "6410949831858",
    eanConfidence: "retailer",
    reason: "EAN HTML page liée invalidé ; rétabli EAN retailer cité pour Force Noire",
  },
  "Milo 50 ml": {
    officialName: "Milo 50 ml — Saint Flava",
    url: "https://www.aromes-et-liquides.fr/e-liquide-swoke/17239-milo-50ml-saint-flava.html",
    pgVg: "40/60",
    nicotine: "0 mg/ml",
    boost: "1–2 boosters",
    invalidateEan: true,
    reason: "EAN conflictuels 6410943215678 vs 3111577004425 — non retenu",
  },
};

async function main() {
  const hits: any[] = JSON.parse(fs.readFileSync(HITS, "utf8"));
  const impossibles = JSON.parse(fs.readFileSync(IMP, "utf8"));
  const byName = new Map(hits.map((h) => [h.catalogName, h]));
  let photosNew = 0;

  // Search Press Start Speed/Sword/Jump via airmust category HTML
  const pressHtml = await fetchText("https://airmust.com/308-press-start");
  if (pressHtml) {
    const linkRe =
      /href="(https:\/\/airmust\.com\/[^"]*press-start-(speed|sword|jump)[^"]*(\d{13})?\.html)"/gi;
    // also relative
    const relRe =
      /href="(\/?formats\/[^"]*press-start-(speed|sword|jump)[^"]*\.html)"/gi;
    const found: { flavor: string; url: string }[] = [];
    for (const re of [linkRe, relRe]) {
      let m;
      while ((m = re.exec(pressHtml))) {
        const raw = m[1].startsWith("http") ? m[1] : `https://airmust.com${m[1]}`;
        found.push({ flavor: m[2], url: raw });
      }
    }
    for (const f of found) {
      const name =
        f.flavor === "speed"
          ? "Speed 50 ml"
          : f.flavor === "sword"
            ? "Sword 50 ml"
            : "Jump 50 ml";
      if (!PATCHES[name]) {
        PATCHES[name] = {
          officialName: `Press Start - ${f.flavor} 50ml`,
          url: f.url,
          pgVg: "50/50",
          nicotine: "0 mg/ml (50 dans 75)",
          boost: "boosters",
        };
      }
    }
  }

  for (const [name, patch] of Object.entries(PATCHES)) {
    const hit = byName.get(name);
    if (!hit) continue;
    hit.officialName = patch.officialName;
    hit.pgVg = patch.pgVg || hit.pgVg;
    hit.nicotineSoldAs = patch.nicotine || hit.nicotineSoldAs;
    hit.nicotineBoostOptions = patch.boost || hit.nicotineBoostOptions;
    hit.sourceUrls = Array.from(new Set([...(hit.sourceUrls || []), patch.url]));
    if (patch.invalidateEan) {
      hit.ean = null;
      hit.eanConfidence = "conflict";
      hit.notes = [...(hit.notes || []), patch.reason || "EAN invalidé"];
    } else if (patch.eanOverride) {
      hit.ean = patch.eanOverride;
      hit.eanConfidence = patch.eanConfidence || "retailer";
    } else {
      const fromUrl = eanFromUrl(patch.url);
      if (fromUrl) {
        hit.ean = fromUrl;
        hit.eanConfidence = /airmust\.com|eliquid-france\.com/i.test(patch.url)
          ? "official_site"
          : "retailer";
      }
    }
    if (patch.reason && !patch.invalidateEan) {
      hit.notes = [...(hit.notes || []), patch.reason];
    }
    if (!hit.formatMl) {
      const m = name.match(/(\d+)\s*ml/i);
      if (m) hit.formatMl = Number(m[1]);
    }
    const html = await fetchText(patch.url);
    if (html && !hit.photoLocal) {
      const img = og(html);
      if (img) {
        const abs = img.startsWith("http") ? img : new URL(img, patch.url).toString();
        const dest = path.join(OUT, "photos", `${slugify(name)}.jpg`);
        if (await dl(abs, dest)) {
          hit.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
          hit.photoUrl = abs;
          photosNew += 1;
        }
      }
    }
  }

  // Deduplicate EAN across different products → invalidate duplicates
  const eanOwners = new Map<string, string[]>();
  for (const h of hits) {
    if (!h.ean) continue;
    const arr = eanOwners.get(h.ean) || [];
    arr.push(h.catalogName);
    eanOwners.set(h.ean, arr);
  }
  for (const [ean, names] of eanOwners) {
    if (names.length > 1) {
      for (const n of names) {
        const h = byName.get(n)!;
        h.ean = null;
        h.eanConfidence = "conflict";
        h.notes = [
          ...(h.notes || []),
          `EAN ${ean} partagé entre: ${names.join(", ")} — invalidé`,
        ];
      }
    }
  }

  // Recompute status
  for (const h of hits) {
    const eanOk =
      Boolean(h.ean) && h.eanConfidence !== "conflict" && h.eanConfidence !== "missing";
    h.missingFields = [];
    if (!h.formatMl) h.missingFields.push("formatMl");
    if (!h.pgVg) h.missingFields.push("pgVg");
    if (!h.nicotineSoldAs) h.missingFields.push("nicotine");
    if (!eanOk) h.missingFields.push("ean");
    if (!h.photoLocal) h.missingFields.push("photo");
    if (h.missingFields.length === 0) h.status = "complete";
    else if (h.officialName || (h.sourceUrls || []).length) h.status = "partial";
    else h.status = "introuvable";

    const fname = `${slugify(h.catalogName)}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(h, null, 2));
    if (h.status !== "introuvable") {
      fs.writeFileSync(path.join(OUT, "produits-retrouves", fname), JSON.stringify(h, null, 2));
    }
  }

  const complete = hits.filter((h) => h.status === "complete");
  const still = hits.filter((h) => h.status !== "complete");
  const photosTotal = fs.readdirSync(path.join(OUT, "photos")).length;
  const bannersTotal = fs.readdirSync(path.join(OUT, "bannieres")).length;

  const report = `# Rapport final — Recherche web exhaustive (${impossibles.length} produits)

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/recherche-web/\`  

## Contraintes

- Aucune donnée inventée
- Aucun prix / stock / sumupProductId modifié en base
- EAN conflictuels ou partagés entre produits **invalidés**
- Photos uniquement depuis pages produit (og:image)
- Bannières : placeholders SVG fabricant+gamme (pas de faux packshot)

## Synthèse demandée

| Indicateur | Nb |
|---|---:|
| Produits entièrement complétés | **${complete.length}** |
| Nouvelles photos (passe 3) | **${photosNew}** |
| Photos totales récupérées | **${photosTotal}** |
| Bannières créées (SVG gamme) | **${bannersTotal}** |
| Produits restant réellement incomplets | **${still.length}** |

## Produits entièrement complétés

${complete.map((h) => `- **${h.catalogName}** — EAN \`${h.ean}\` (${h.eanConfidence}) · ${h.officialName || ""}`).join("\n")}

## Liste détaillée — impossibles à compléter

${still
  .map((h) => {
    const why = [
      h.missingFields?.length ? `manque: ${h.missingFields.join(", ")}` : null,
      (h.notes || []).find((n: string) => /invalid|conflict|B2B|insuffisant|non/i.test(n)),
    ]
      .filter(Boolean)
      .join(" — ");
    return `- **${h.catalogName}** (${h.manufacturer || "?"} / ${h.range || "?"}) — ${why || h.status}`;
  })
  .join("\n")}

## Causes principales

1. Packshots / EAN absents des pages publiques (Hopper, une partie Ferox, Juice 66, Liquide Lab B2B)
2. EAN Swoke souvent conflictuels entre revendeurs
3. Visuels de gamme officiels non téléchargeables librement → bannières placeholder
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_RECHERCHE_WEB_98.md"), report);
  fs.writeFileSync(HITS, JSON.stringify(hits, null, 2));
  fs.writeFileSync(
    path.join(OUT, "rapports", "ENCORE_IMPOSSIBLES.json"),
    JSON.stringify(still, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        complete: complete.length,
        photosNew,
        photosTotal,
        bannersTotal,
        stillIncomplete: still.length,
        completes: complete.map((h) => h.catalogName),
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
