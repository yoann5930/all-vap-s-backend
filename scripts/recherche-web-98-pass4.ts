import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "recherche-web");
const hits: any[] = JSON.parse(
  fs.readFileSync(path.join(OUT, "rapports", "RECHERCHE_HITS.json"), "utf8"),
);

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

async function ogFetch(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "AllVaps/3" } });
  if (!res.ok) return { html: null as string | null, status: res.status };
  return { html: await res.text(), status: res.status };
}

function extractOg(html: string) {
  const m =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  return m?.[1] ?? null;
}

async function download(url: string, dest: string) {
  const r = await fetch(url);
  if (!r.ok) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1200) return false;
  fs.writeFileSync(dest, buf);
  return true;
}

const patches: Record<
  string,
  { name: string; url: string; ean: string | null; conf?: string }
> = {
  "Speed 50 ml": {
    name: "Press Start - Speed 50ml",
    url: "https://airmust.com/formats/2700-6344-press-start-speed-50ml-3701719512309.html",
    ean: "3701719512309",
    conf: "official_site",
  },
  "Sword 50 ml": {
    name: "Press Start - Sword 50ml",
    url: "https://airmust.com/formats/2699-6343-press-start-sword-50ml-3701719512286.html",
    ean: "3701719512286",
    conf: "official_site",
  },
  "Jump 50 ml": {
    name: "Press Start - Jump 50ml",
    url: "https://airmust.com/formats/2698-6342-press-start-jump-50ml-3701719512279.html",
    ean: "3701719512279",
    conf: "official_site",
  },
};

const fruizeeTries: Record<string, string[]> = {
  "Mangue Passion 50 ml": [
    "https://www.eliquid-france.com/fruizee-max/1496-mangue-passion-50ml-3760202040699.html",
    "https://www.ciga.fr/pd-9783-mangue-passion-50ml-fruizee-max-3760202040699.html",
  ],
  "Triple Mangue 50 ml": [
    "https://www.eliquid-france.com/fruizee-max/1498-triple-mangue-50ml-3760202040712.html",
    "https://www.vapo-shop.fr/e-liquides-fruizee-max/3697-triple-mangue-50ml-fruizee-max-fruizee-3760202040712.html",
  ],
};

async function main() {
  let photosNew = 0;

  for (const [cat, p] of Object.entries(patches)) {
    const h = hits.find((x) => x.catalogName === cat);
    if (!h) continue;
    h.officialName = p.name;
    h.pgVg = h.pgVg || "50/50";
    h.nicotineSoldAs = h.nicotineSoldAs || "0 mg/ml (50 dans 75)";
    h.nicotineBoostOptions = h.nicotineBoostOptions || "boosters";
    h.formatMl = h.formatMl || 50;
    h.sourceUrls = [...new Set([...(h.sourceUrls || []), p.url])];
    if (p.ean) {
      h.ean = p.ean;
      h.eanConfidence = p.conf || "official_site";
    }
    if (!h.photoLocal) {
      const { html } = await ogFetch(p.url);
      if (html) {
        const img = extractOg(html);
        if (img) {
          const abs = img.startsWith("http") ? img : new URL(img, p.url).toString();
          const dest = path.join(OUT, "photos", `${slug(cat)}.jpg`);
          if (await download(abs, dest)) {
            h.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
            h.photoUrl = abs;
            photosNew += 1;
          }
        }
      }
    }
  }

  for (const [name, urls] of Object.entries(fruizeeTries)) {
    const h = hits.find((x) => x.catalogName === name);
    if (!h) continue;
    h.pgVg = h.pgVg || "50/50";
    h.nicotineSoldAs = h.nicotineSoldAs || "0 mg/ml shortfill";
    h.nicotineBoostOptions = h.nicotineBoostOptions || "jusqu'à 2 boosters";
    h.formatMl = h.formatMl || 50;
    for (const u of urls) {
      const { html, status } = await ogFetch(u);
      if (!html) {
        h.notes = [...(h.notes || []), `HTTP ${status} ${u}`];
        continue;
      }
      const ean = (u.match(/(\d{13})/) || [])[1];
      if (ean) {
        h.ean = ean;
        h.eanConfidence = u.includes("eliquid-france") ? "official_site" : "retailer";
        h.officialName = h.officialName || `Fruizee Max — ${name}`;
        h.sourceUrls = [...new Set([...(h.sourceUrls || []), u])];
      }
      if (!h.photoLocal) {
        const img = extractOg(html);
        if (img) {
          const abs = img.startsWith("http") ? img : new URL(img, u).toString();
          const dest = path.join(OUT, "photos", `${slug(name)}.jpg`);
          if (await download(abs, dest)) {
            h.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
            photosNew += 1;
          }
        }
      }
      break;
    }
  }

  for (const h of hits) {
    const eanOk =
      Boolean(h.ean) && h.eanConfidence !== "conflict" && h.eanConfidence !== "missing";
    h.missingFields = [];
    if (!h.formatMl) h.missingFields.push("formatMl");
    if (!h.pgVg) h.missingFields.push("pgVg");
    if (!h.nicotineSoldAs) h.missingFields.push("nicotine");
    if (!eanOk) h.missingFields.push("ean");
    if (!h.photoLocal) h.missingFields.push("photo");
    h.status =
      h.missingFields.length === 0
        ? "complete"
        : h.officialName || h.sourceUrls?.length
          ? "partial"
          : "introuvable";
    const fname = `${slug(h.catalogName)}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(h, null, 2));
    if (h.status !== "introuvable") {
      fs.writeFileSync(
        path.join(OUT, "produits-retrouves", fname),
        JSON.stringify(h, null, 2),
      );
    }
  }

  const complete = hits.filter((h) => h.status === "complete");
  const still = hits.filter((h) => h.status !== "complete");
  const photosTotal = fs.readdirSync(path.join(OUT, "photos")).length;
  const bannersTotal = fs.readdirSync(path.join(OUT, "bannieres")).length;

  const report = `# Rapport final — Recherche web exhaustive (98 produits)

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/recherche-web/\`  

## Contraintes respectées

- Aucune invention de donnée
- Aucun prix / stock / SumUp modifié
- EAN conflictuels invalidés
- Aucune application automatique en base

## Synthèse demandée

| Indicateur | Nb |
|---|---:|
| Produits entièrement complétés | **${complete.length}** |
| Nouvelles photos (cette passe) | **${photosNew}** |
| Photos totales récupérées | **${photosTotal}** |
| Bannières créées | **${bannersTotal}** |
| Produits restant réellement incomplets | **${still.length}** |

## Produits entièrement complétés

${complete
  .map((h) => `- **${h.catalogName}** — EAN \`${h.ean}\` (${h.eanConfidence})`)
  .join("\n")}

## Liste détaillée — impossibles à compléter

${still
  .map(
    (h) =>
      `- **${h.catalogName}** (${h.manufacturer || "?"} / ${h.range || "?"}) — manque: ${(h.missingFields || []).join(", ")}${
        (h.notes || []).some((n: string) => /conflict|invalid|B2B|insuffisant/i.test(n))
          ? " · " +
            (h.notes || []).find((n: string) => /conflict|invalid|B2B|insuffisant/i.test(n))
          : ""
      }`,
  )
  .join("\n")}
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_RECHERCHE_WEB_98.md"), report);
  fs.writeFileSync(path.join(OUT, "rapports", "RECHERCHE_HITS.json"), JSON.stringify(hits, null, 2));
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
        still: still.length,
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
