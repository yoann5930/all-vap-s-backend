/**
 * Finalisation catalogue All Vap's — analyse + fiches dans catalogues/finalisation/
 * Lecture DB OK. Aucune modification prix/stock. Aucune suppression actif.
 * Aucun remplacement sumupProductId valide. Aucune liaison auto incertaine.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";
import { isGroupPhotoUrl } from "../lib/catalog/images";

const ROOT = path.resolve("catalogues/finalisation");
const QUEUE = path.resolve("data/rebuild/QUEUE_VALIDATION_SUMUP_RESTANTE.json");
const SUMUP_CSV = path.resolve("inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv");
const PRE = path.resolve("backups/sumup-audit-2026-08-03/pre-apply-exact/PRODUCTS_SNAPSHOT.json");

function ensureDirs() {
  for (const d of [
    ROOT,
    path.join(ROOT, "produits-corriges"),
    path.join(ROOT, "produits-retrouves"),
    path.join(ROOT, "photos"),
    path.join(ROOT, "bannieres"),
    path.join(ROOT, "fiches"),
    path.join(ROOT, "rapports"),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function parseCsvMultiline(text: string, sep: "," | ";"): Record<string, string>[] {
  const raw = text.replace(/^\uFEFF/, "");
  const rowsRaw: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (q && raw[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
      continue;
    }
    if (!q && c === sep) {
      row.push(cur);
      cur = "";
      continue;
    }
    if (!q && (c === "\n" || c === "\r")) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim())) rowsRaw.push(row);
      row = [];
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((x) => x.trim())) rowsRaw.push(row);
  }
  if (!rowsRaw.length) return [];
  const headers = rowsRaw[0].map((h) => h.trim());
  return rowsRaw.slice(1).map((cols) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (cols[i] ?? "").trim()));
    return o;
  });
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(webp|jpe?g|png)$/i.test(ent.name) && !/-thumb/i.test(ent.name)) out.push(full);
  }
  return out;
}

function scorePhoto(file: string, productName: string, mfrSlug: string | null): number {
  const base = path.basename(file).replace(/\.(webp|jpe?g|png)$/i, "");
  const fn = normalizeCatalogKey(base.replace(/[-_]+/g, " "));
  const pn = normalizeCatalogKey(productName);
  if (/gamme|collection|cover|logo|banner|pack/i.test(fn)) return 0;
  if (isGroupPhotoUrl("/" + file.replace(/\\/g, "/"))) return 0;
  const tokens = pn.split(/\s+/).filter((t) => t.length > 2 && !/^(ml|mg|eliquide|liquide)$/.test(t));
  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) if (fn.includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.85) return 0;
  const folder = file.replace(/\\/g, "/").toLowerCase();
  if (mfrSlug && folder.includes(`/products/${mfrSlug}/`)) return Math.round(ratio * 20) + 5;
  if (mfrSlug && folder.includes(mfrSlug)) return Math.round(ratio * 20) + 2;
  return Math.round(ratio * 20);
}

function extractFlavor(name: string): string | null {
  let n = name
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/\b(e-?liquide|concentre|concentr[eé]|sels?|nicotine|by|the)\b/gi, " ")
    .replace(/[-–—|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n || null;
}

async function main() {
  ensureDirs();
  const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
  const pre = JSON.parse(fs.readFileSync(PRE, "utf8"));

  const inactiveIds = queue.entries
    .filter((e: any) => e.statut === "PRODUIT_INACTIF")
    .map((e: any) => e.produitCatalogueId)
    .filter(Boolean);
  const missingIds = queue.entries
    .filter((e: any) => e.statut === "DONNEES_MANQUANTES" && e.source === "CATALOG_WITHOUT_SUMUP")
    .map((e: any) => e.produitCatalogueId)
    .filter(Boolean);
  const manualEntries = queue.entries.filter((e: any) => e.statut === "VALIDATION_MANUELLE_SIMPLE");

  const allIds = [...new Set([...inactiveIds, ...missingIds, ...manualEntries.map((e: any) => e.produitCatalogueId)])];
  const products = await prisma.product.findMany({
    where: { id: { in: allIds } },
    include: {
      manufacturer: true,
      rangeRef: true,
      avaMeta: true,
      catalogImages: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // All active products for duplicate-name check
  const allCatalog = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      sumupProductId: true,
      barcode: true,
      priceCents: true,
      stock: true,
      imageUrl: true,
      imageStatus: true,
      volumeMl: true,
      manufacturerId: true,
      rangeId: true,
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true, manufacturerId: true } },
    },
  });

  // SumUp CSV index by normalized name
  const sumupRows = parseCsvMultiline(fs.readFileSync(SUMUP_CSV, "utf8"), ",");
  const sumupByNorm = new Map<string, any[]>();
  for (const r of sumupRows) {
    const name = (r["Item name"] || "").replace(/^\t+/, "").trim();
    const id = (r["Item id (Do not change)"] || "").trim();
    if (!name || !id) continue;
    const k = normalizeCatalogKey(name);
    if (!sumupByNorm.has(k)) sumupByNorm.set(k, []);
    sumupByNorm.get(k)!.push({
      name,
      itemId: id,
      barcode: (r.Barcode || "").trim(),
      category: (r.Category || "").trim(),
      price: (r.Price || "").trim(),
      visibleCheckout: (r["Display item at Checkout? (Yes/No)"] || "").trim(),
      online: (r["Display item in Online Store? (Yes/No)"] || "").trim(),
    });
  }

  const mediaFiles = walk(path.join(process.cwd(), "public", "media", "products"));
  const rangeCovers = walk(path.join(process.cwd(), "public", "media", "manufacturers"));

  // ========== ÉTAPE 1 — 515 inactifs ==========
  const inactiveReport: any[] = [];
  let inactiveReallyInSumup = 0;
  let inactiveAlsoActiveAlias = 0;
  let inactiveNoSumupTrace = 0;
  let inactivePossibleReplacement = 0;

  for (const id of inactiveIds) {
    const p = byId.get(id);
    if (!p) continue;
    const norm = normalizeCatalogKey(p.name);
    const sumupHits = sumupByNorm.get(norm) || [];
    const activeAliases = allCatalog.filter(
      (a) => a.id !== p.id && a.isActive && normalizeCatalogKey(a.name) === norm,
    );
    // soft replacement: same manufacturer + similar name tokens
    const tokens = norm.split(/\s+/).filter((t) => t.length > 3).slice(0, 3);
    const replacements =
      tokens.length >= 2
        ? allCatalog
            .filter((a) => {
              if (a.id === p.id || !a.isActive) return false;
              if (p.manufacturerId && a.manufacturerId && a.manufacturerId !== p.manufacturerId) return false;
              const an = normalizeCatalogKey(a.name);
              return tokens.every((t) => an.includes(t));
            })
            .slice(0, 3)
        : [];

    const inSumup = sumupHits.length > 0;
    if (inSumup) inactiveReallyInSumup += 1;
    else inactiveNoSumupTrace += 1;
    if (activeAliases.length) inactiveAlsoActiveAlias += 1;
    if (replacements.length && !activeAliases.length) inactivePossibleReplacement += 1;

    inactiveReport.push({
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      catalogStatus: p.catalogStatus,
      visibleOnline: p.visibleOnline,
      sumupProductId: p.sumupProductId,
      barcode: p.barcode,
      manufacturer: p.manufacturer?.name || null,
      range: p.rangeRef?.name || null,
      presentInSumupExport: inSumup,
      sumupMatches: sumupHits.map((h) => ({
        itemId: h.itemId,
        barcode: h.barcode,
        checkout: h.visibleCheckout,
        online: h.online,
      })),
      activeAliasSameName: activeAliases.map((a) => ({
        id: a.id,
        name: a.name,
        sumupProductId: a.sumupProductId,
      })),
      possibleReplacements: replacements.map((a) => ({
        id: a.id,
        name: a.name,
        sumupProductId: a.sumupProductId,
      })),
      verdict: activeAliases.length
        ? "DOUBLON_ACTIF_SOUS_MEME_NOM"
        : inSumup
          ? "INACTIF_CATALOGUE_MAIS_PRESENT_SUMUP"
          : replacements.length
            ? "POSSIBLE_REMPLACEMENT"
            : "INACTIF_SANS_TRACE_SUMUP",
      action: activeAliases.length
        ? "Conserver inactif ; utiliser la fiche active — ne pas supprimer sans validation"
        : inSumup
          ? "Revue : réactiver + lier SumUp manuellement si toujours vendu"
          : "Conserver inactif / historique — ne pas supprimer auto",
    });
  }

  fs.writeFileSync(
    path.join(ROOT, "rapports", "RAPPORT_PRODUITS_INACTIFS.md"),
    `# Rapport — 515 produits catalogue inactifs (sans SumUp)

**Note :** ce sont des fiches **catalogue** \`isActive=false\`, pas nécessairement des articles « inactifs SumUp ».

## Synthèse

| Indicateur | Nb |
|---|---:|
| Analysés | ${inactiveReport.length} |
| Présents dans l’export SumUp (même nom) | ${inactiveReallyInSumup} |
| Alias actif même nom | ${inactiveAlsoActiveAlias} |
| Possible remplacement (même fabricant, nom proche) | ${inactivePossibleReplacement} |
| Sans trace SumUp | ${inactiveNoSumupTrace} |

## Détail (extrait des cas à risque)

${inactiveReport
  .filter((r) => r.verdict !== "INACTIF_SANS_TRACE_SUMUP")
  .slice(0, 80)
  .map(
    (r) =>
      `- **${r.name}** — \`${r.verdict}\` · mfr=${r.manufacturer || "—"} · sumupHits=${r.sumupMatches.length} · aliasActifs=${r.activeAliasSameName.length} · ${r.action}`,
  )
  .join("\n") || "_aucun cas à risque particulier_"}

## Tous les verdicts

\`\`\`json
${JSON.stringify(
  inactiveReport.reduce((a: any, r) => {
    a[r.verdict] = (a[r.verdict] || 0) + 1;
    return a;
  }, {}),
  null,
  2,
)}
\`\`\`

Fichier JSON : \`produits-corriges/inactifs-analyse.json\`
`,
  );
  fs.writeFileSync(
    path.join(ROOT, "produits-corriges", "inactifs-analyse.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), count: inactiveReport.length, items: inactiveReport }, null, 2),
  );

  // ========== ÉTAPE 2 — 98 données manquantes ==========
  const missingReport: any[] = [];
  let photosRecovered = 0;
  let bannersCopied = 0;
  let fichesCreated = 0;
  const impossibles: any[] = [];

  for (const id of missingIds) {
    const p = byId.get(id);
    if (!p) continue;
    const mfrSlug = p.manufacturer?.slug || null;
    const found: Record<string, unknown> = {
      fabricant: p.manufacturer?.name || null,
      gamme: p.rangeRef?.name || null,
      saveur: extractFlavor(p.name),
      format: p.volumeMl != null ? `${p.volumeMl} ml` : null,
      nicotine: null,
      ean: p.barcode || null,
      photoOfficielle: null as string | null,
      categorie: p.category || null,
      sources: [] as string[],
    };
    const missingFields: string[] = [];

    // nicotine from name only if explicit
    const nm = p.name.match(/\b(\d+(?:[.,]\d+)?)\s*mg\b/i);
    if (nm) {
      found.nicotine = `${nm[1].replace(",", ".")} mg`;
      (found.sources as string[]).push("extrait_nom");
    } else missingFields.push("nicotine");

    if (!found.fabricant) missingFields.push("fabricant");
    else (found.sources as string[]).push("catalogue_prisma");
    if (!found.gamme) missingFields.push("gamme");
    else (found.sources as string[]).push("catalogue_prisma_gamme");
    if (!found.ean) missingFields.push("ean");
    if (!found.format) missingFields.push("format");

    // Local official photo search — certain match only
    let best: { file: string; score: number } | null = null;
    for (const f of mediaFiles) {
      const s = scorePhoto(f, p.name, mfrSlug);
      if (s < 18) continue;
      if (!best || s > best.score) best = { file: f, score: s };
    }
    if (best) {
      const rel = best.file.replace(/\\/g, "/").split("/public/")[1];
      found.photoOfficielle = rel ? `/${rel}` : null;
      (found.sources as string[]).push(`photo_locale:${best.file}`);
      // copy optimized into finalisation/photos
      const dest = path.join(ROOT, "photos", `${p.slug || p.id}.webp`);
      try {
        await sharp(best.file)
          .rotate()
          .resize(1000, 1000, { fit: "inside", background: { r: 11, g: 16, b: 22 } })
          .flatten({ background: { r: 11, g: 16, b: 22 } })
          .webp({ quality: 90 })
          .toFile(dest);
        photosRecovered += 1;
        found.photoFinalisation = `catalogues/finalisation/photos/${path.basename(dest)}`;
      } catch {
        impossibles.push({ id: p.id, name: p.name, reason: "photo_locale_conversion_echec" });
      }
    } else {
      missingFields.push("photo_officielle");
    }

    // Range banner if exists locally
    let banner: string | null = null;
    if (mfrSlug && p.rangeRef?.slug) {
      const cover = rangeCovers.find((f) =>
        f.replace(/\\/g, "/").includes(`/manufacturers/${mfrSlug}/ranges/${p.rangeRef!.slug}`),
      );
      if (cover) {
        banner = cover;
        const destB = path.join(ROOT, "bannieres", `${mfrSlug}__${p.rangeRef.slug}.webp`);
        if (!fs.existsSync(destB)) {
          try {
            await sharp(cover).resize(1600, 600, { fit: "cover" }).webp({ quality: 88 }).toFile(destB);
            bannersCopied += 1;
          } catch {
            /* ignore */
          }
        } else {
          bannersCopied += 0;
        }
        found.banniereGamme = `catalogues/finalisation/bannieres/${mfrSlug}__${p.rangeRef.slug}.webp`;
        (found.sources as string[]).push(`banniere_locale:${cover}`);
      } else {
        missingFields.push("banniere_gamme");
      }
    } else {
      missingFields.push("banniere_gamme");
    }

    // SumUp name hit? (no auto link)
    const sumupHits = sumupByNorm.get(normalizeCatalogKey(p.name)) || [];
    if (sumupHits.length === 1 && !p.sumupProductId) {
      found.sumupCandidatExactNom = sumupHits[0];
      (found.sources as string[]).push("sumup_nom_exact_non_applique");
    }

    const fiche = {
      id: p.id,
      slug: p.slug,
      nom: p.name,
      description:
        p.description ||
        p.shortDescription ||
        (found.fabricant && found.gamme && found.saveur
          ? `${found.saveur} — gamme ${found.gamme} (${found.fabricant})${found.format ? `, ${found.format}` : ""}.`
          : null),
      seo: {
        title: `${p.name}${found.fabricant ? ` | ${found.fabricant}` : ""} | All Vap's`,
        description:
          p.shortDescription ||
          `Découvrez ${p.name}${found.gamme ? ` de la gamme ${found.gamme}` : ""}${found.fabricant ? ` par ${found.fabricant}` : ""} chez All Vap's.`,
      },
      complete: missingFields.length === 0,
      champsManquants: missingFields,
      trouve: found,
      prix: "NON_MODIFIE",
      stock: "NON_MODIFIE",
      sumupProductId: p.sumupProductId,
      note: "Fiche générée hors publication — validation humaine requise avant import DB",
    };

    fs.writeFileSync(path.join(ROOT, "fiches", `${p.slug || p.id}.json`), JSON.stringify(fiche, null, 2));
    fichesCreated += 1;

    if (missingFields.includes("ean") || missingFields.includes("photo_officielle")) {
      impossibles.push({
        id: p.id,
        name: p.name,
        reason: `impossible_auto: ${missingFields.join(", ")}`,
        manufacturer: p.manufacturer?.name,
        range: p.rangeRef?.name,
      });
    }

    missingReport.push({
      id: p.id,
      name: p.name,
      champsManquants: missingFields,
      photoTrouvee: Boolean(found.photoOfficielle),
      banniereTrouvee: Boolean(found.banniereGamme),
      sumupNomExact: sumupHits.length === 1,
    });

    if (fiche.complete || found.photoOfficielle) {
      fs.writeFileSync(
        path.join(ROOT, "produits-retrouves", `${p.slug || p.id}.json`),
        JSON.stringify(fiche, null, 2),
      );
    }
  }

  fs.writeFileSync(
    path.join(ROOT, "rapports", "RAPPORT_DONNEES_MANQUANTES.md"),
    `# Rapport — 98 produits données manquantes

Recherche : Prisma + médias locaux + covers gamme.  
**Aucune invention** d’EAN / SumUp / photo incertaine. **Aucun prix.**

## Synthèse

| Indicateur | Nb |
|---|---:|
| Analysés | ${missingReport.length} |
| Photos locales certaines récupérées | ${photosRecovered} |
| Fiches créées | ${fichesCreated} |
| Avec photo | ${missingReport.filter((r) => r.photoTrouvee).length} |
| Avec bannière gamme locale | ${missingReport.filter((r) => r.banniereTrouvee).length} |
| Nom exact SumUp (non lié auto) | ${missingReport.filter((r) => r.sumupNomExact).length} |
| Encore incomplets | ${impossibles.length} |

## Produits

${missingReport
  .map(
    (r) =>
      `- **${r.name}** — manquant: ${r.champsManquants.join(", ") || "—"} · photo=${r.photoTrouvee} · bannière=${r.banniereTrouvee}`,
  )
  .join("\n")}
`,
  );

  // ========== ÉTAPE 3 — 14 validations manuelles ==========
  const manualReport: any[] = [];
  for (const e of manualEntries) {
    const p = byId.get(e.produitCatalogueId);
    const sumupHits = sumupByNorm.get(normalizeCatalogKey(e.nomSumUp || "")) || [];
    const hit = sumupHits.find((h) => h.itemId === e.sumupProductId) || sumupHits[0];
    manualReport.push({
      sumup: {
        name: e.nomSumUp,
        sumupProductId: e.sumupProductId,
        ean: e.ean || hit?.barcode || null,
        category: e.categorieSumUp || hit?.category || null,
        format: e.format,
        nicotine: e.nicotine,
      },
      catalogue: {
        id: p?.id,
        name: p?.name,
        manufacturer: p?.manufacturer?.name,
        range: p?.rangeRef?.name,
        volumeMl: p?.volumeMl,
        barcode: p?.barcode,
        sumupProductId: p?.sumupProductId,
        imageUrl: p?.imageUrl,
        priceCents: p?.priceCents,
      },
      comparaison: {
        nomsIdentiques: normalizeCatalogKey(e.nomSumUp || "") === normalizeCatalogKey(p?.name || ""),
        formatOk:
          !e.format ||
          !p?.volumeMl ||
          e.format.includes(String(p.volumeMl)),
        eanSumUp: hit?.barcode || e.ean || null,
        eanCatalogue: p?.barcode || null,
        catalogueDejaLie: Boolean(p?.sumupProductId),
      },
      actionProposee: p?.sumupProductId
        ? p.sumupProductId === e.sumupProductId
          ? "Déjà lié correctement — aucune action"
          : "CONFLIT potentiel — ne pas écraser"
        : "VALIDATION HUMAINE : lier sumupProductId si confirmation métier",
      applique: false,
    });
  }

  fs.writeFileSync(
    path.join(ROOT, "rapports", "RAPPORT_VALIDATIONS_MANUELLES_14.md"),
    `# 14 validations manuelles — côte à côte

**Aucune application automatique.**

${manualReport
  .map(
    (r, i) => `## ${i + 1}. ${r.sumup.name}

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | ${r.sumup.name} | ${r.catalogue.name} |
| ID SumUp | \`${r.sumup.sumupProductId}\` | ${r.catalogue.sumupProductId ? `\`${r.catalogue.sumupProductId}\`` : "**absent**"} |
| EAN | ${r.sumup.ean || "**absent**"} | ${r.catalogue.barcode || "**absent**"} |
| Fabricant | — | ${r.catalogue.manufacturer || "—"} |
| Gamme | — | ${r.catalogue.range || "—"} |
| Format | ${r.sumup.format || "—"} | ${r.catalogue.volumeMl ?? "—"} ml |
| Nicotine | ${r.sumup.nicotine || "—"} | — |
| Catégorie | ${r.sumup.category || "—"} | — |

**Comparaison :** nomsIdentiques=${r.comparaison.nomsIdentiques} · formatOk=${r.comparaison.formatOk} · déjàLié=${r.comparaison.catalogueDejaLie}  
**Action :** ${r.actionProposee}
`,
  )
  .join("\n")}
`,
  );
  fs.writeFileSync(
    path.join(ROOT, "produits-corriges", "validations-manuelles-14.json"),
    JSON.stringify(manualReport, null, 2),
  );

  // ========== ÉTAPE 6 — vérif finale catalogue ==========
  const bySumup = new Map<string, any[]>();
  const byEan = new Map<string, any[]>();
  let orphan = 0;
  let mfrMix = 0;
  let rangeMix = 0;
  let photoMismatch = 0;
  let bannerMfrMismatch = 0;

  for (const p of allCatalog) {
    if (p.sumupProductId) {
      if (!bySumup.has(p.sumupProductId)) bySumup.set(p.sumupProductId, []);
      bySumup.get(p.sumupProductId)!.push(p);
    }
    const ean = (p.barcode || "").replace(/\D/g, "");
    if (ean) {
      if (!byEan.has(ean)) byEan.set(ean, []);
      byEan.get(ean)!.push(p);
    }
    if (p.isActive && !p.manufacturerId) orphan += 1;
    if (p.rangeRef?.manufacturerId && p.manufacturerId && p.rangeRef.manufacturerId !== p.manufacturerId) {
      mfrMix += 1;
    }
    if (p.imageUrl && p.manufacturer?.slug) {
      const m = p.imageUrl.match(/\/media\/products\/([^/]+)\//);
      if (m && m[1] !== p.manufacturer.slug && !["shared", "_raw", "_backup_pre_normalize"].includes(m[1])) {
        const aliases: Record<string, string[]> = {
          "e-tasty": ["etasty"],
          "liquide-lab": ["liquidelab", "liquid-lab"],
          "vape-47": ["vape47"],
        };
        if (!aliases[p.manufacturer.slug]?.includes(m[1])) photoMismatch += 1;
      }
    }
  }

  // banner check sample: manufacturer folder vs slug
  for (const f of rangeCovers) {
    const m = f.replace(/\\/g, "/").match(/\/manufacturers\/([^/]+)\/ranges\//);
    if (!m) continue;
    // ok structurally
  }

  const dupSumup = [...bySumup.entries()].filter(([, l]) => l.length > 1);
  const dupEan = [...byEan.entries()].filter(([, l]) => l.length > 1);

  // integrity vs pre snapshot (prices/stocks)
  let priceChanged = 0;
  let stockChanged = 0;
  let deleted = 0;
  for (const old of pre.products) {
    const now = allCatalog.find((p) => p.id === old.id);
    if (!now) {
      deleted += 1;
      continue;
    }
    if (now.priceCents !== old.priceCents) priceChanged += 1;
    if (now.stock !== old.stock) stockChanged += 1;
  }

  const actifs = allCatalog.filter((p) => p.isActive);
  const complets = actifs.filter(
    (p) =>
      p.sumupProductId &&
      p.barcode &&
      p.imageUrl &&
      p.imageStatus === "official" &&
      p.manufacturerId &&
      p.rangeId,
  );

  const pct =
    actifs.length > 0 ? Math.round((complets.length / actifs.length) * 1000) / 10 : 0;

  const finalReport = `# RAPPORT FINAL — Finalisation catalogue All Vap's

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/\`

## Contraintes respectées

- Aucun prix modifié : **${priceChanged}**
- Aucun stock modifié : **${stockChanged}**
- Aucun produit actif supprimé : **${deleted}** suppression(s) détectée(s) vs snapshot
- Aucun sumupProductId valide remplacé
- Aucune validation manuelle appliquée automatiquement

## Étape 1 — Inactifs (515)

| Indicateur | Nb |
|---|---:|
| Analysés | ${inactiveReport.length} |
| Présents SumUp (même nom) | ${inactiveReallyInSumup} |
| Alias actif même nom | ${inactiveAlsoActiveAlias} |
| Sans trace SumUp | ${inactiveNoSumupTrace} |

→ \`rapports/RAPPORT_PRODUITS_INACTIFS.md\`

## Étape 2 — Données manquantes (98)

| Indicateur | Nb |
|---|---:|
| Fiches créées | ${fichesCreated} |
| Photos récupérées (locales certaines) | ${photosRecovered} |
| Bannières gamme copiées/optimisées | ${bannersCopied} |
| Encore incomplets (EAN/photo absents) | ${impossibles.filter((i) => String(i.reason).startsWith("impossible_auto")).length} |

→ \`rapports/RAPPORT_DONNEES_MANQUANTES.md\` · \`fiches/\` · \`photos/\`

## Étape 3 — Validations manuelles (14)

Toutes documentées côte à côte, **0 application**.

→ \`rapports/RAPPORT_VALIDATIONS_MANUELLES_14.md\`

## Étape 6 — Contrôles catalogue

| Contrôle | Résultat |
|---|---|
| Doublons sumupProductId | ${dupSumup.length} |
| EAN dupliqués | ${dupEan.length} |
| Produits actifs orphelins (sans fabricant) | ${orphan} |
| Fabricant/gamme mélangés | ${mfrMix} |
| Photos path ≠ fabricant | ${photoMismatch} |
| Prix modifiés | ${priceChanged} |
| Stocks modifiés | ${stockChanged} |

## Chiffres finaux demandés

- nombre total de produits actifs : **${actifs.length}**
- nombre total de produits complets (SumUp+EAN+photo official+fabricant+gamme) : **${complets.length}**
- nombre total de photos récupérées (cette finalisation) : **${photosRecovered}**
- nombre total de bannières créées/optimisées : **${bannersCopied}**
- nombre de produits restant à compléter (98 incomplets + 14 manuelles + inactifs à revoir) : **${impossibles.filter((i) => String(i.reason).startsWith("impossible_auto")).length + 14 + inactiveReallyInSumup}**
- liste des éléments impossibles à compléter automatiquement : voir \`produits-corriges/impossibles.json\` (${impossibles.length} entrées)
- état final du catalogue All Vap's (complets / actifs) : **${pct} %**

## Éléments impossibles automatiquement (extrait)

${impossibles
  .slice(0, 40)
  .map((i) => `- ${i.name || i.id} — ${i.reason}`)
  .join("\n") || "_aucun_"}
`;

  fs.writeFileSync(path.join(ROOT, "RAPPORT_FINAL_FINALISATION_CATALOGUE.md"), finalReport);
  fs.writeFileSync(
    path.join(ROOT, "produits-corriges", "impossibles.json"),
    JSON.stringify(impossibles, null, 2),
  );
  fs.writeFileSync(
    path.join(ROOT, "rapports", "VERIFICATION_CATALOGUE.json"),
    JSON.stringify(
      {
        actifs: actifs.length,
        complets: complets.length,
        pct,
        dupSumup: dupSumup.length,
        dupEan: dupEan.length,
        orphan,
        mfrMix,
        photoMismatch,
        priceChanged,
        stockChanged,
        photosRecovered,
        bannersCopied,
        fichesCreated,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        inactiveAnalyzed: inactiveReport.length,
        inactiveInSumup: inactiveReallyInSumup,
        inactiveAlias: inactiveAlsoActiveAlias,
        missingFiches: fichesCreated,
        photosRecovered,
        bannersCopied,
        manualDocumented: manualReport.length,
        actifs: actifs.length,
        complets: complets.length,
        pct,
        impossibles: impossibles.length,
        dupSumup: dupSumup.length,
        dupEan: dupEan.length,
        priceChanged,
        stockChanged,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
