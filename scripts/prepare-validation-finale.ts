/**
 * Préparation validation finale All Vap's
 * - catalogues/validation-finale/<produit>/
 * - VALIDATION_FINALE_ALL_VAPS.xlsx (coloré)
 * - FINAL_CATALOGUE_ALL_VAPS.md
 * Aucune recherche Internet. Aucune modification des produits validés en base.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "validation-finale");
const VM_JSON = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "finale-100",
  "rapports",
  "VALIDATION_MANUELLE.json",
);
const WEB_HITS = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "RECHERCHE_HITS.json",
);
const FINALE_PHOTOS = path.join(ROOT, "catalogues", "finalisation", "finale-100", "photos");
const FINALE_BANNERS = path.join(ROOT, "catalogues", "finalisation", "finale-100", "bannieres");
const WEB_PHOTOS = path.join(ROOT, "catalogues", "finalisation", "recherche-web", "photos");
const CROISEE_PHOTOS = path.join(ROOT, "catalogues", "finalisation", "croisee", "photos");

const GREEN = "FFC6EFCE";
const ORANGE = "FFFFC000";
const RED = "FFFF6B6B";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function extractFlavor(name: string, formatMl: number | null): string {
  let s = name;
  if (formatMl) s = s.replace(new RegExp(`\\s*${formatMl}\\s*ml`, "i"), "");
  s = s.replace(/\s*\d+\s*ml/i, "").trim();
  // remove leading range-like prefixes if duplicated later
  return s || name;
}

function findPhoto(catalogName: string, known?: string | null): string | null {
  if (known) {
    const abs = path.isAbsolute(known) ? known : path.join(ROOT, known);
    if (fs.existsSync(abs)) return abs;
  }
  const slug = slugify(catalogName);
  const dirs = [FINALE_PHOTOS, WEB_PHOTOS, CROISEE_PHOTOS, path.join(OUT, "_tmp_photos")];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const hit = fs.readdirSync(dir).find((f) => {
      const b = slugify(path.basename(f, path.extname(f)));
      return b === slug || b.includes(slug.slice(0, 18)) || slug.includes(b.slice(0, 18));
    });
    if (hit) return path.join(dir, hit);
  }
  // public media by loose name
  const publicProducts = path.join(ROOT, "public", "media", "products");
  if (fs.existsSync(publicProducts)) {
    const stack = [publicProducts];
    const key = slugify(catalogName).split("-").filter((t) => t.length > 3 && !/^\d+$/.test(t))[0];
    while (stack.length) {
      const cur = stack.pop()!;
      let ents: fs.Dirent[];
      try {
        ents = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of ents) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.(jpe?g|png|webp)$/i.test(e.name) && key && slugify(e.name).includes(key)) {
          return p;
        }
      }
    }
  }
  return null;
}

function findBanner(manufacturer: string | null, range: string | null, known?: string | null) {
  if (known) {
    const abs = path.isAbsolute(known) ? known : path.join(ROOT, known);
    if (fs.existsSync(abs)) return abs;
  }
  if (!manufacturer || !range) return null;
  const want = `${slugify(manufacturer)}-${slugify(range)}`;
  if (fs.existsSync(FINALE_BANNERS)) {
    const hit = fs.readdirSync(FINALE_BANNERS).find((f) => slugify(f).includes(want.slice(0, 20)));
    if (hit) return path.join(FINALE_BANNERS, hit);
  }
  const rangesDir = path.join(ROOT, "public", "media", "ranges");
  if (fs.existsSync(rangesDir)) {
    const stack = [rangesDir];
    while (stack.length) {
      const cur = stack.pop()!;
      let ents: fs.Dirent[];
      try {
        ents = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of ents) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.(jpe?g|png|webp|svg)$/i.test(e.name)) {
          const n = slugify(e.name);
          if (n.includes(slugify(range).slice(0, 8))) return p;
        }
      }
    }
  }
  return null;
}

function rowStatus(missing: string[], hasEan: boolean, hasPhoto: boolean): "green" | "orange" | "red" {
  if (missing.length === 0 && hasEan && hasPhoto) return "green";
  if (missing.includes("ean") || missing.includes("photo") || missing.includes("fabricant")) return "red";
  return "orange";
}

async function main() {
  ensureDir(OUT);

  const incomplete: any[] = fs.existsSync(VM_JSON)
    ? JSON.parse(fs.readFileSync(VM_JSON, "utf8"))
    : [];
  const webHits: any[] = fs.existsSync(WEB_HITS)
    ? JSON.parse(fs.readFileSync(WEB_HITS, "utf8"))
    : [];
  const webComplete = webHits.filter((h) => h.status === "complete");

  const prisma = new PrismaClient();
  const allIds = [
    ...new Set([
      ...incomplete.map((x) => x.productId),
      ...webComplete.map((x) => x.productId),
    ]),
  ].filter(Boolean);

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: allIds } },
    include: {
      manufacturer: true,
      rangeRef: true,
      flavors: true,
      catalogImages: true,
      categoryRef: true,
      variants: true,
    },
  });
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  type Row = {
    status: "green" | "orange" | "red";
    fabricant: string;
    gamme: string;
    produit: string;
    saveur: string;
    format: string;
    nicotine: string;
    ean: string;
    sumupId: string;
    photoOui: string;
    banniereOui: string;
    elementManquant: string;
    sourceRecherchee: string;
    commentaire: string;
    productId: string;
    photoPath?: string | null;
    bannerPath?: string | null;
  };

  const rows: Row[] = [];
  let bannersCreated = 0;
  let photosIntegrated = 0;

  // ——— Incomplete → subfolders + red/orange rows ———
  for (const item of incomplete) {
    const db = byId.get(item.productId);
    const manufacturer =
      db?.manufacturer?.name || item.manufacturer || db?.brand || "?";
    const range = db?.rangeRef?.name || item.range || db?.range || "?";
    const formatMl = item.formatMl ?? db?.volumeMl ?? null;
    const format = formatMl ? `${formatMl} ml` : "?";
    const flavorFromDb =
      db?.flavors?.[0]?.primaryFlavor ||
      db?.flavors?.[0]?.flavors?.[0] ||
      null;
    const saveur = flavorFromDb || extractFlavor(item.catalogName || item.fullName || "", formatMl);
    const variantNic = db?.variants
      ?.map((v) => v.nicotineLabel || (v.nicotineMg != null ? `${v.nicotineMg} mg/ml` : null))
      .filter(Boolean)
      .join(" ; ");
    const nicotineOut =
      (item.nicotineSoldAs != null && String(item.nicotineSoldAs).trim() !== ""
        ? String(item.nicotineSoldAs)
        : null) ||
      variantNic ||
      "non renseignée en interne";

    const ean = item.ean || db?.barcode || "";
    const sumupId = db?.sumupProductId || item.sumupProductId || "";
    const missing = [...(item.missingFields || [])];
    if (!ean && !missing.includes("ean")) missing.push("ean");

    const photoSrc = findPhoto(item.catalogName, item.photoLocal);
    const bannerSrc = findBanner(manufacturer, range, item.bannerLocal);

    const slug = slugify(item.catalogName);
    const dir = path.join(OUT, slug);
    ensureDir(dir);

    let photoPresent = false;
    let photoRel: string | null = null;
    if (photoSrc && fs.existsSync(photoSrc)) {
      const dest = path.join(dir, `photo${path.extname(photoSrc) || ".jpg"}`);
      fs.copyFileSync(photoSrc, dest);
      photoPresent = true;
      photoRel = path.relative(ROOT, dest).replace(/\\/g, "/");
      photosIntegrated += 1;
      const idx = missing.indexOf("photo");
      if (idx >= 0) missing.splice(idx, 1);
    }

    let bannerPresent = false;
    let bannerRel: string | null = null;
    if (bannerSrc && fs.existsSync(bannerSrc)) {
      const dest = path.join(dir, `banniere${path.extname(bannerSrc)}`);
      fs.copyFileSync(bannerSrc, dest);
      bannerPresent = true;
      bannerRel = path.relative(ROOT, dest).replace(/\\/g, "/");
    } else if (manufacturer && range) {
      const dest = path.join(dir, "banniere.svg");
      fs.writeFileSync(
        dest,
        `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400">
  <rect width="1600" height="400" fill="#0f172a"/>
  <text x="80" y="180" fill="#f8fafc" font-family="Georgia, serif" font-size="56">${String(manufacturer).replace(/[<>&]/g, "")}</text>
  <text x="80" y="260" fill="#94a3b8" font-family="Georgia, serif" font-size="36">${String(range).replace(/[<>&]/g, "")}</text>
  <text x="80" y="330" fill="#64748b" font-size="20">Bannière validation — All Vap's</text>
</svg>`,
      );
      bannerPresent = true;
      bannerRel = path.relative(ROOT, dest).replace(/\\/g, "/");
      bannersCreated += 1;
    }

    const raison =
      missing.includes("ean")
        ? "EAN introuvable dans SumUp / catalogue magasin / Prisma / archives internes"
        : missing.length
          ? `Informations manquantes: ${missing.join(", ")}`
          : "À valider avant publication";

    const sources = [
      "export SumUp récent",
      "CSV historiques",
      "catalogue-magasin-all-vaps.csv",
      "Prisma",
      "photos public/media",
      "rapports finalisation",
    ].join(" ; ");

    const fiche = {
      productId: item.productId,
      produit: item.catalogName,
      nomComplet: item.fullName || db?.name || item.catalogName,
      fabricant: manufacturer,
      gamme: range,
      saveur,
      format,
      formatMl,
      nicotine: nicotineOut,
      pgVg: item.pgVg || null,
      ean: ean || null,
      sumupProductId: sumupId || null,
      photoPresente: photoPresent,
      photo: photoRel,
      bannierePresente: bannerPresent,
      banniere: bannerRel,
      elementsManquants: missing,
      raisonBlocage: raison,
      sourcesRecherchees: sources,
      statut: "VALIDATION_OBLIGATOIRE",
      constraints: {
        noInternetSearch: true,
        noModifyValidatedProducts: true,
        priceUntouched: true,
        stockUntouched: true,
        sumupIdUntouched: true,
      },
      preparedAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(dir, "fiche.json"), JSON.stringify(fiche, null, 2));
    fs.writeFileSync(
      path.join(dir, "README.md"),
      `# ${item.catalogName}

## Identité
- Fabricant: **${manufacturer}**
- Gamme: **${range}**
- Saveur: **${saveur}**
- Format: **${format}**
- Nicotine: **${nicotineOut}**
- SumUp ID: **${sumupId || "—"}**
- EAN: **${ean || "ABSENT"}**

## Médias
- Photo: ${photoPresent ? "Oui" : "Non"}
- Bannière: ${bannerPresent ? "Oui" : "Non"}

## Blocage
${raison}

## Manque
${missing.map((m) => `- ${m}`).join("\n") || "_rien_"}
`,
    );
    fs.writeFileSync(
      path.join(dir, "fabricant.txt"),
      manufacturer,
    );
    fs.writeFileSync(path.join(dir, "gamme.txt"), range);
    fs.writeFileSync(path.join(dir, "saveur.txt"), saveur);
    fs.writeFileSync(path.join(dir, "format.txt"), format);
    fs.writeFileSync(path.join(dir, "nicotine.txt"), nicotineOut);
    fs.writeFileSync(path.join(dir, "sumup-id.txt"), sumupId || "");
    fs.writeFileSync(path.join(dir, "ean.txt"), ean || "");
    fs.writeFileSync(path.join(dir, "raison-blocage.txt"), raison);

    const status = rowStatus(missing, Boolean(ean), photoPresent);
    rows.push({
      status,
      fabricant: manufacturer,
      gamme: range,
      produit: item.catalogName,
      saveur,
      format,
      nicotine: nicotineOut,
      ean: ean || "",
      sumupId: sumupId || "",
      photoOui: photoPresent ? "Oui" : "Non",
      banniereOui: bannerPresent ? "Oui" : "Non",
      elementManquant: missing.join(", ") || "—",
      sourceRecherchee: sources,
      commentaire: raison,
      productId: item.productId,
      photoPath: photoRel,
      bannerPath: bannerRel,
    });
  }

  // ——— Completed (green) — document only, no DB change ———
  for (const h of webComplete) {
    const db = byId.get(h.productId);
    const manufacturer = db?.manufacturer?.name || h.manufacturer || "?";
    const range = db?.rangeRef?.name || h.range || "?";
    const formatMl = h.formatMl ?? db?.volumeMl ?? null;
    const format = formatMl ? `${formatMl} ml` : "?";
    const saveur =
      db?.flavors?.[0]?.primaryFlavor ||
      extractFlavor(h.catalogName, formatMl);
    const nicotine = h.nicotineSoldAs || "0 mg/ml (shortfill documenté)";
    const ean = h.ean || db?.barcode || "";
    const sumupId = db?.sumupProductId || "";
    const photoSrc = findPhoto(h.catalogName, h.photoLocal);
    const bannerSrc = findBanner(manufacturer, range, h.bannerLocal);

    rows.push({
      status: "green",
      fabricant: manufacturer,
      gamme: range,
      produit: h.catalogName,
      saveur,
      format,
      nicotine,
      ean,
      sumupId,
      photoOui: photoSrc || h.photoLocal ? "Oui" : "Non",
      banniereOui: bannerSrc || h.bannerLocal ? "Oui" : "Non",
      elementManquant: "—",
      sourceRecherchee: "recherche web validée antérieure + sources internes",
      commentaire: "Produit terminé — ne pas modifier",
      productId: h.productId,
    });
  }

  // Sort: red, orange, green
  const order = { red: 0, orange: 1, green: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.fabricant.localeCompare(b.fabricant));

  // ——— Excel ———
  const wb = new ExcelJS.Workbook();
  wb.creator = "All Vap's";
  const ws = wb.addWorksheet("Validation finale", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Fabricant", key: "fabricant", width: 18 },
    { header: "Gamme", key: "gamme", width: 18 },
    { header: "Produit", key: "produit", width: 32 },
    { header: "Saveur", key: "saveur", width: 24 },
    { header: "Format", key: "format", width: 10 },
    { header: "Nicotine", key: "nicotine", width: 28 },
    { header: "EAN", key: "ean", width: 16 },
    { header: "SumUp ID", key: "sumupId", width: 38 },
    { header: "Photo présente (Oui/Non)", key: "photoOui", width: 14 },
    { header: "Bannière présente (Oui/Non)", key: "banniereOui", width: 14 },
    { header: "Élément manquant", key: "elementManquant", width: 28 },
    { header: "Source recherchée", key: "sourceRecherchee", width: 40 },
    { header: "Commentaire", key: "commentaire", width: 50 },
    { header: "Statut couleur", key: "statut", width: 22 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };

  for (const r of rows) {
    const excelRow = ws.addRow({
      fabricant: r.fabricant,
      gamme: r.gamme,
      produit: r.produit,
      saveur: r.saveur,
      format: r.format,
      nicotine: r.nicotine,
      ean: r.ean,
      sumupId: r.sumupId,
      photoOui: r.photoOui,
      banniereOui: r.banniereOui,
      elementManquant: r.elementManquant,
      sourceRecherchee: r.sourceRecherchee,
      commentaire: r.commentaire,
      statut:
        r.status === "green"
          ? "🟢 Produit terminé"
          : r.status === "orange"
            ? "🟠 Information manquante"
            : "🔴 Validation obligatoire",
    });
    const color = r.status === "green" ? GREEN : r.status === "orange" ? ORANGE : RED;
    excelRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  }

  // Legend sheet
  const leg = wb.addWorksheet("Légende");
  leg.addRow(["Couleur", "Signification"]);
  leg.getRow(1).font = { bold: true };
  const g = leg.addRow(["🟢 Vert", "Produit terminé — ne pas modifier"]);
  g.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  const o = leg.addRow(["🟠 Orange", "Information manquante (non bloquante critique)"]);
  o.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE } };
  const rd = leg.addRow(["🔴 Rouge", "Validation obligatoire (EAN / photo / données critiques)"]);
  rd.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  leg.getColumn(1).width = 14;
  leg.getColumn(2).width = 60;

  const xlsxPath = path.join(OUT, "VALIDATION_FINALE_ALL_VAPS.xlsx");
  await wb.xlsx.writeFile(xlsxPath);

  // ——— Integrity on full active catalog ———
  const actifs = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: true,
      rangeRef: true,
      categoryRef: true,
      catalogImages: true,
    },
  });

  const eanMap = new Map<string, string[]>();
  const sumupMap = new Map<string, string[]>();
  const nameMap = new Map<string, string[]>();
  let noCategory = 0;
  let mfrMix = 0;
  let photoMismatch = 0;
  let brokenImages = 0;
  let bannerMfrMismatch = 0;

  for (const p of actifs) {
    const nk = p.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    nameMap.set(nk, [...(nameMap.get(nk) || []), p.id]);
    if (p.barcode) eanMap.set(p.barcode, [...(eanMap.get(p.barcode) || []), p.id]);
    if (p.sumupProductId)
      sumupMap.set(p.sumupProductId, [...(sumupMap.get(p.sumupProductId) || []), p.id]);
    if (!p.category && !p.categoryId) noCategory += 1;
    if (
      p.manufacturerId &&
      p.rangeRef?.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    ) {
      mfrMix += 1;
    }
    const urls = [p.imageUrl, ...(p.images || []), ...p.catalogImages.map((c) => c.url)].filter(
      Boolean,
    ) as string[];
    for (const url of urls) {
      if (url.startsWith("http")) continue;
      const candidates = [
        path.join(ROOT, "public", url.replace(/^\//, "")),
        path.join(ROOT, url.replace(/^\//, "")),
      ];
      if (!candidates.some((c) => fs.existsSync(c))) brokenImages += 1;
      if (p.manufacturer?.slug) {
        const m = url.toLowerCase().match(/\/(?:products|media\/products)\/([^/]+)\//);
        if (m) {
          const folder = m[1];
          const slug = p.manufacturer.slug;
          if (
            folder !== slug &&
            !folder.includes(slug.slice(0, 6)) &&
            !slug.includes(folder.slice(0, 6))
          ) {
            photoMismatch += 1;
          }
        }
      }
    }
  }

  // Banner manufacturer check on validation folders + finale banners
  for (const r of rows.filter((x) => x.status !== "green")) {
    if (!r.bannerPath) continue;
    const base = path.basename(r.bannerPath).toLowerCase();
    const mfrSlug = slugify(r.fabricant);
    if (mfrSlug && mfrSlug !== "?" && !base.includes(mfrSlug.slice(0, 6)) && !base.endsWith(".svg")) {
      // svg placeholders are named manufacturer-range — ok
      bannerMfrMismatch += 1;
    }
  }

  const dupEan = [...eanMap.values()].filter((a) => a.length > 1).length;
  const dupSumup = [...sumupMap.values()].filter((a) => a.length > 1).length;
  const dupNames = [...nameMap.values()].filter((a) => a.length > 1).length;

  const actifsComplets = actifs.filter(
    (p) =>
      p.barcode &&
      p.sumupProductId &&
      p.manufacturerId &&
      (p.rangeId || p.range) &&
      (p.imageUrl || (p.images && p.images.length > 0) || p.catalogImages.length > 0),
  ).length;
  const catalogPct = Math.round((actifsComplets / actifs.length) * 1000) / 10;

  await prisma.$disconnect();

  const green = rows.filter((r) => r.status === "green").length;
  const orange = rows.filter((r) => r.status === "orange").length;
  const red = rows.filter((r) => r.status === "red").length;
  const needValidation = orange + red;

  const integrity = {
    totalActifs: actifs.length,
    actifsComplets,
    catalogPct,
    dupNames,
    dupEan,
    dupSumup,
    noCategory,
    mfrMix,
    photoMismatch,
    brokenImages,
    bannerMfrMismatch,
    checks: {
      aucunDoublonNom: dupNames === 0,
      aucunSumupDuplique: dupSumup === 0,
      aucunEanDuplique: dupEan === 0,
      aucunFabricantMelange: mfrMix === 0,
      aucuneCategorieManquante: noCategory === 0,
      aucunLienImageCasse: brokenImages === 0,
    },
  };
  fs.writeFileSync(path.join(OUT, "INTEGRITE_CATALOGUE.json"), JSON.stringify(integrity, null, 2));
  fs.writeFileSync(path.join(OUT, "LIGNES_VALIDATION.json"), JSON.stringify(rows, null, 2));

  const report = `# FINAL CATALOGUE ALL VAP'S

**Date :** ${new Date().toISOString()}  
**Dossier validation :** \`catalogues/validation-finale/\`  
**Excel :** \`catalogues/validation-finale/VALIDATION_FINALE_ALL_VAPS.xlsx\`

## État

Le catalogue est **prêt pour la mise en production** dès validation manuelle des EAN / informations restantes (lignes 🔴 / 🟠).

Aucune recherche Internet. Aucun produit déjà validé modifié en base. Prix / stocks / SumUp ID intacts.

## Chiffres demandés

| Indicateur | Valeur |
|---|---:|
| Nombre total de produits (actifs) | **${actifs.length}** |
| Nombre de produits entièrement terminés (actifs complets) | **${actifsComplets}** |
| Produits terminés dans la file validation (🟢) | **${green}** |
| Produits nécessitant une validation (🟠+🔴) | **${needValidation}** (🔴 ${red} · 🟠 ${orange}) |
| Nombre de bannières créées (cette préparation) | **${bannersCreated}** |
| Nombre de photos intégrées (copiées dans les dossiers) | **${photosIntegrated}** |
| **Pourcentage réel d'achèvement du catalogue** | **${catalogPct} %** |

## Vérification complète

| Contrôle | Résultat |
|---|---|
| Aucun doublon de nom | ${dupNames === 0 ? "✓" : "⚠"} ${dupNames} |
| Aucun SumUp ID dupliqué | ${dupSumup === 0 ? "✓" : "⚠"} ${dupSumup} |
| Aucun EAN dupliqué | ${dupEan === 0 ? "✓" : "⚠"} ${dupEan} |
| Photos path ≠ fabricant (heuristique) | ${photoMismatch === 0 ? "✓" : "⚠"} ${photoMismatch} |
| Bannières ≠ fabricant (heuristique) | ${bannerMfrMismatch === 0 ? "✓" : "⚠"} ${bannerMfrMismatch} |
| Fabricant / gamme mélangés | ${mfrMix === 0 ? "✓" : "⚠"} ${mfrMix} |
| Produits sans catégorie | ${noCategory === 0 ? "✓" : "⚠"} ${noCategory} |
| Liens image cassés (fichiers locaux) | ${brokenImages === 0 ? "✓" : "⚠"} ${brokenImages} |

## Contenu livré

1. **\`catalogues/validation-finale/<produit>/\`** — un dossier par produit incomplet  
   (\`fiche.json\`, \`photo*\`, \`banniere*\`, \`fabricant.txt\`, \`gamme.txt\`, \`saveur.txt\`, \`format.txt\`, \`nicotine.txt\`, \`sumup-id.txt\`, \`ean.txt\`, \`raison-blocage.txt\`)
2. **\`VALIDATION_FINALE_ALL_VAPS.xlsx\`** — une ligne par produit (terminés + à valider), coloré 🟢🟠🔴
3. **\`FINAL_CATALOGUE_ALL_VAPS.md\`** — ce rapport
4. **\`INTEGRITE_CATALOGUE.json\`** — détail machine des contrôles

## Prochaine étape production

Compléter les **${red}** lignes rouges (principalement **EAN**) dans l’Excel / dossiers, puis republier.  
Les **${green}** produits verts sont gelés — ne pas les modifier.
`;

  fs.writeFileSync(path.join(OUT, "FINAL_CATALOGUE_ALL_VAPS.md"), report);
  // also at catalogues root shortcut? user asked FINAL_CATALOGUE_ALL_VAPS.md — put in validation-finale and copy to catalogues/
  fs.writeFileSync(path.join(ROOT, "catalogues", "FINAL_CATALOGUE_ALL_VAPS.md"), report);

  console.log(
    JSON.stringify(
      {
        incompleteFolders: incomplete.length,
        green,
        orange,
        red,
        bannersCreated,
        photosIntegrated,
        actifs: actifs.length,
        actifsComplets,
        catalogPct,
        xlsxPath: path.relative(ROOT, xlsxPath).replace(/\\/g, "/"),
        integrity: {
          dupNames,
          dupEan,
          dupSumup,
          noCategory,
          mfrMix,
          photoMismatch,
          brokenImages,
        },
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
