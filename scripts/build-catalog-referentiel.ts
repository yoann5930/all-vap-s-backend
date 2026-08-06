#!/usr/bin/env tsx
/**
 * Référentiel catalogue All Vap's — étapes 1 → 6 (données uniquement).
 *
 * Ne génère AUCUNE page / composant front.
 * N'invente jamais : ambigu → status "a_verifier".
 *
 * Sources :
 * - MASTER_PRODUCT_REFERENCE (CSV)
 * - sumup_match (MATCH_AUTO, MATCH_A_VALIDER, ABSENTS…)
 * - Fabricants/ (dossiers locaux)
 * - RAPPORT_PHOTOTHEQUE.json
 * - PostgreSQL (état courant produits validés)
 *
 * Sortie : data/referentiel/
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const MASTER_ROOT =
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE";
const FABRICANTS_ROOT =
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/Fabricants";
const OUT = path.resolve("data/referentiel");
const PHOTO_REPORT = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");

type CsvRow = Record<string, string>;

function parseCsv(text: string, sep: "," | ";"): CsvRow[] {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  function splitLine(line: string) {
    const cols: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
        continue;
      }
      if (c === sep && !q) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    cols.push(cur);
    return cols;
  }
  const headers = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const obj: CsvRow = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

function readCsv(file: string, sep: "," | ";" = ";"): CsvRow[] {
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, "utf8"), sep);
}

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isAmbiguous(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = v.trim().toLowerCase();
  if (!t) return true;
  return /^(a[_\s-]?verifier|à vérifier|a verifier|n\/?a|manquant|manquante|\?+)$/i.test(t);
}

/** Normalise une contenance texte → code format ou null. */
function normalizeFormat(raw: string | null | undefined): {
  code: string | null;
  label: string | null;
  ml: number | null;
  status: "valide" | "a_verifier";
  sourceRaw: string | null;
} {
  const sourceRaw = raw?.trim() || null;
  if (!sourceRaw || isAmbiguous(sourceRaw)) {
    return { code: null, label: null, ml: null, status: "a_verifier", sourceRaw };
  }
  const t = sourceRaw.toLowerCase().replace(/,/g, ".");
  const m = t.match(/\b(10|20|30|50|60|70|75|100|200)\s*ml\b/);
  if (m) {
    const ml = Number(m[1]);
    return { code: `${ml}ml`, label: `${ml} ml`, ml, status: "valide", sourceRaw };
  }
  // Contenance composée sans ml clair
  return { code: null, label: null, ml: null, status: "a_verifier", sourceRaw };
}

function normalizeStatus(raw: string | null | undefined): "verifie" | "partiel" | "a_verifier" {
  const t = (raw || "").toLowerCase();
  if (/verifie_site|verifie_distributeur|verifie/.test(t) && !/partiel|à vérifier|a_verifier/.test(t)) {
    return "verifie";
  }
  if (/partiel/.test(t)) return "partiel";
  return "a_verifier";
}

function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
}

function writeJson(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  console.log("=== Construction référentiel catalogue All Vap's ===\n");
  ensureOut();

  // ── Sources MASTER ──────────────────────────────────────────────
  const manufacturersRaw = readCsv(path.join(MASTER_ROOT, "MASTER_MANUFACTURERS.csv"));
  const brandsRaw = readCsv(path.join(MASTER_ROOT, "MASTER_BRANDS.csv"));
  const rangesRaw = readCsv(path.join(MASTER_ROOT, "MASTER_RANGES.csv"));
  const productsRaw = readCsv(path.join(MASTER_ROOT, "MASTER_PRODUCTS.csv"));
  const flavoursRaw = readCsv(path.join(MASTER_ROOT, "MASTER_FLAVOURS.csv"));
  const eanKnown = readCsv(path.join(MASTER_ROOT, "MASTER_EAN.csv"));
  const eanTodo = readCsv(path.join(MASTER_ROOT, "EAN_A_COMPLETER.csv"));

  const matchAuto = readCsv(path.join(MASTER_ROOT, "sumup_match", "MATCH_AUTO.csv"));
  const matchAValider = readCsv(path.join(MASTER_ROOT, "sumup_match", "MATCH_A_VALIDER.csv"));
  const absentsMaster = readCsv(path.join(MASTER_ROOT, "sumup_match", "MASTER_ABSENTS_DE_SUMUP.csv"));
  const importFinal = readCsv(path.join(MASTER_ROOT, "IMPORT_SUMUP_FINAL.csv"), ",");
  if (!importFinal.length) {
    readCsv(path.join(MASTER_ROOT, "sumup_match", "IMPORT_SUMUP_FINAL.csv"), ",");
  }

  const autoIds = new Set(matchAuto.map((r) => r.id_all_vaps).filter(Boolean));
  const aValiderIds = new Set(matchAValider.map((r) => r.id_all_vaps).filter(Boolean));
  const absentIds = new Set(absentsMaster.map((r) => r.id_all_vaps).filter(Boolean));
  const importSumupIds = new Set(
    importFinal.map((r) => r["Item id (Do not change)"] || r["Item id"]).filter(Boolean)
  );

  // Dossiers Fabricants locaux
  const fabricantDirs = fs.existsSync(FABRICANTS_ROOT)
    ? fs
        .readdirSync(FABRICANTS_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  // Photos
  let photoByName = new Map<string, any>();
  let photoByProductId = new Map<string, any>();
  if (fs.existsSync(PHOTO_REPORT)) {
    const photo = JSON.parse(fs.readFileSync(PHOTO_REPORT, "utf8"));
    for (const p of photo.produits || []) {
      if (p.productId) photoByProductId.set(p.productId, p);
      if (p.name) photoByName.set(String(p.name).toLowerCase(), p);
    }
  }

  // DB produits validés
  const dbProducts = await prisma.product.findMany({
    where: { catalogStatus: "valide" },
    select: {
      id: true,
      name: true,
      brand: true,
      range: true,
      productType: true,
      barcode: true,
      sumupProductId: true,
      sumupVariantId: true,
      sumupName: true,
      imageUrl: true,
      imageStatus: true,
      productFamily: true,
      catalogStatus: true,
      visibleOnline: true,
      importAnomaly: true,
      reference: true,
      slug: true,
    },
  });
  const dbBySumup = new Map(dbProducts.filter((p) => p.sumupProductId).map((p) => [p.sumupProductId!, p]));
  const dbByName = new Map(dbProducts.map((p) => [p.name.toLowerCase(), p]));

  // ════════════════════════════════════════════════════════════════
  // 1. FABRICANTS
  // ════════════════════════════════════════════════════════════════
  const fabricants = manufacturersRaw.map((r) => {
    const slug = r.slug || slugify(r.nom);
    const dossierLocal = fabricantDirs.find((d) => d.toLowerCase() === slug.toLowerCase()) || null;
    let packshotsCount = 0;
    let produitsMdCount = 0;
    if (dossierLocal) {
      const pack = path.join(FABRICANTS_ROOT, dossierLocal, "Packshots");
      const prod = path.join(FABRICANTS_ROOT, dossierLocal, "Produits");
      if (fs.existsSync(pack)) {
        packshotsCount = fs.readdirSync(pack).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).length;
      }
      if (fs.existsSync(prod)) {
        produitsMdCount = fs.readdirSync(prod).filter((f) => f.endsWith(".md")).length;
      }
    }
    const status = normalizeStatus(r.status);
    const site = isAmbiguous(r.site) ? null : r.site;
    return {
      id: r.id_fabricant,
      nom: r.nom,
      slug: slugify(slug.replace(/_/g, "-")),
      slugDossier: slug,
      site,
      pays: isAmbiguous(r.pays) ? null : r.pays,
      email: isAmbiguous(r.email) ? null : r.email,
      marquesDeclarees: (r.marques || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
      gammesCountMaster: Number(r.gammes_count || 0) || 0,
      produitsCountMaster: Number(r.produits_count || 0) || 0,
      status,
      statusSource: r.status || null,
      dossierLocal,
      packshotsLocaux: packshotsCount,
      fichesProduitsLocales: produitsMdCount,
      anomalies: [
        !site ? "site_a_verifier" : null,
        !dossierLocal ? "dossier_fabricant_absent" : null,
        status === "a_verifier" ? "statut_fabricant_a_verifier" : null,
      ].filter(Boolean) as string[],
    };
  });

  // Fabricants présents en dossiers mais absents du MASTER CSV
  for (const dir of fabricantDirs) {
    const slug = slugify(dir.replace(/_/g, "-"));
    if (!fabricants.some((f) => f.slugDossier?.toLowerCase() === dir.toLowerCase() || f.slug === slug)) {
      fabricants.push({
        id: `MFR-local-${slug}`,
        nom: dir.replace(/_/g, " "),
        slug,
        slugDossier: dir,
        site: null,
        pays: null,
        email: null,
        marquesDeclarees: [],
        gammesCountMaster: 0,
        produitsCountMaster: 0,
        status: "a_verifier" as const,
        statusSource: "dossier_local_hors_master",
        dossierLocal: dir,
        packshotsLocaux: 0,
        fichesProduitsLocales: 0,
        anomalies: ["present_dossier_absent_master_csv"],
      });
    }
  }

  writeJson("01_FABRICANTS.json", {
    date: new Date().toISOString(),
    total: fabricants.length,
    verifie: fabricants.filter((f) => f.status === "verifie").length,
    partiel: fabricants.filter((f) => f.status === "partiel").length,
    aVerifier: fabricants.filter((f) => f.status === "a_verifier").length,
    items: fabricants,
  });
  console.log(`1. Fabricants : ${fabricants.length}`);

  // ════════════════════════════════════════════════════════════════
  // 2. GAMMES
  // ════════════════════════════════════════════════════════════════
  const gammes = rangesRaw.map((r) => {
    const formatsParsed = (r.formats || "")
      .split(/[,|/]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => normalizeFormat(s));
    const formatCodes = [
      ...new Set(formatsParsed.filter((f) => f.code).map((f) => f.code!)),
    ];
    const status = normalizeStatus(r.status);
    const formatsAmbiguous =
      !formatCodes.length ||
      isAmbiguous(r.formats) ||
      formatsParsed.some((f) => f.status === "a_verifier" && f.sourceRaw);
    return {
      id: r.id_gamme,
      nom: r.nom,
      slug: slugify(r.nom_normalise || r.nom),
      fabricant: r.fabricant,
      fabricantSlug: slugify(r.fabricant),
      description: (r.description || "").replace(/(\s*\|\s*Gamme [^\|]+)+/g, "").trim().slice(0, 400) || null,
      site: isAmbiguous(r.site) ? null : r.site,
      formatsDeclares: r.formats || null,
      formatCodes,
      formatsStatus: formatsAmbiguous ? ("a_verifier" as const) : ("valide" as const),
      origine: isAmbiguous(r.origine) ? null : r.origine,
      status,
      statusSource: r.status || null,
      anomalies: [
        status === "a_verifier" ? "gamme_a_verifier" : null,
        formatsAmbiguous ? "formats_a_verifier" : null,
        !r.fabricant ? "fabricant_manquant" : null,
      ].filter(Boolean) as string[],
    };
  });

  writeJson("02_GAMMES.json", {
    date: new Date().toISOString(),
    total: gammes.length,
    verifie: gammes.filter((g) => g.status === "verifie").length,
    aVerifier: gammes.filter((g) => g.status === "a_verifier").length,
    items: gammes,
  });
  console.log(`2. Gammes : ${gammes.length}`);

  // ════════════════════════════════════════════════════════════════
  // 3. FORMATS (inventaire dérivé + déclarations gammes)
  // ════════════════════════════════════════════════════════════════
  const formatMap = new Map<
    string,
    {
      code: string;
      label: string;
      ml: number;
      status: "valide" | "a_verifier";
      sources: string[];
      productCountMaster: number;
      productCountValides: number;
      gammes: string[];
    }
  >();

  function touchFormat(code: string, ml: number, source: string, gamme?: string) {
    const cur = formatMap.get(code) || {
      code,
      label: `${ml} ml`,
      ml,
      status: "valide" as const,
      sources: [] as string[],
      productCountMaster: 0,
      productCountValides: 0,
      gammes: [] as string[],
    };
    if (!cur.sources.includes(source)) cur.sources.push(source);
    if (gamme && !cur.gammes.includes(gamme)) cur.gammes.push(gamme);
    formatMap.set(code, cur);
  }

  // Formats standards connus du métier (référentiel, pas inventés produits)
  for (const [code, ml] of [
    ["10ml", 10],
    ["30ml", 30],
    ["50ml", 50],
    ["100ml", 100],
  ] as const) {
    touchFormat(code, ml, "referentiel_standard");
  }

  for (const g of gammes) {
    for (const c of g.formatCodes) {
      const ml = Number(c.replace("ml", ""));
      touchFormat(c, ml, `gamme:${g.id}`, g.nom);
    }
  }

  let formatsAmbiguousProducts = 0;
  for (const p of productsRaw) {
    const f = normalizeFormat(p.contenance);
    if (f.code && f.ml != null) {
      const entry = formatMap.get(f.code)!;
      if (entry) {
        entry.productCountMaster++;
        if (!entry.sources.includes("master_products")) entry.sources.push("master_products");
      } else {
        touchFormat(f.code, f.ml, "master_products", p.gamme);
        formatMap.get(f.code)!.productCountMaster++;
      }
    } else {
      formatsAmbiguousProducts++;
    }
  }

  for (const p of dbProducts) {
    const f = normalizeFormat(p.productType || "");
    if (f.code) {
      const entry = formatMap.get(f.code);
      if (entry) entry.productCountValides++;
    }
  }

  const formats = [...formatMap.values()].sort((a, b) => a.ml - b.ml);
  writeJson("03_FORMATS.json", {
    date: new Date().toISOString(),
    total: formats.length,
    produitsMasterSansFormatClair: formatsAmbiguousProducts,
    produitsValidesSansFormat: dbProducts.filter((p) => !normalizeFormat(p.productType || "").code).length,
    note: "Les formats sans preuve produit restent listés comme standards métier ; un produit sans contenance claire reste a_verifier.",
    items: formats,
  });
  console.log(`3. Formats : ${formats.length} (master sans format clair: ${formatsAmbiguousProducts})`);

  // ════════════════════════════════════════════════════════════════
  // 4 + 5 + produits unifiés
  // ════════════════════════════════════════════════════════════════
  const matchByMasterId = new Map(matchAuto.map((r) => [r.id_all_vaps, r]));
  const aValiderByMasterId = new Map(matchAValider.map((r) => [r.id_all_vaps, r]));

  const produits = productsRaw.map((p) => {
    const format = normalizeFormat(p.contenance);
    const id = p.id_all_vaps;
    const auto = matchByMasterId.get(id);
    const aVal = aValiderByMasterId.get(id);
    const inAuto = autoIds.has(id);
    const inAValider = aValiderIds.has(id);
    const absentSumup = absentIds.has(id);

    let sumupStatus: "match_auto" | "a_valider" | "absent_sumup" | "hors_perimetre" = "hors_perimetre";
    if (inAuto) sumupStatus = "match_auto";
    else if (inAValider) sumupStatus = "a_valider";
    else if (absentSumup) sumupStatus = "absent_sumup";

    const sumupId = auto?.id_sumup || aVal?.id_sumup || null;
    const db =
      (sumupId && dbBySumup.get(sumupId)) ||
      dbByName.get((p.nom || "").toLowerCase()) ||
      null;

    const photoRow =
      (db && photoByProductId.get(db.id)) ||
      photoByName.get((db?.name || p.nom || "").toLowerCase()) ||
      null;

    const photoOfficielleMaster = !isAmbiguous(p.photo_officielle) && p.photo_officielle !== "MANQUANTE";
    const photoTrouvee = photoRow?.photoOfficielleTrouvee === "oui";
    const photoStatus: "officielle" | "manquante" | "a_verifier" = photoTrouvee
      ? "officielle"
      : photoOfficielleMaster
        ? "a_verifier"
        : "manquante";

    const catalogStatus: "valide" | "a_verifier" | "hors_sumup" =
      inAuto ? "valide" : inAValider ? "a_verifier" : absentSumup ? "hors_sumup" : "a_verifier";

    const anomalies: string[] = [];
    if (format.status === "a_verifier") anomalies.push("format_a_verifier");
    if (photoStatus === "manquante") anomalies.push("photo_manquante");
    if (isAmbiguous(p.ean) && isAmbiguous(p.code_barres)) anomalies.push("ean_manquant");
    if (inAValider) anomalies.push("sumup_a_valider");
    if (absentSumup) anomalies.push("absent_de_sumup");
    if (isAmbiguous(p.pg) || isAmbiguous(p.vg)) anomalies.push("pg_vg_a_verifier");
    if (db?.importAnomaly) anomalies.push(`db:${db.importAnomaly}`);

    return {
      idMaster: id,
      nom: p.nom,
      nomNormalise: p.nom_normalise || null,
      fabricant: p.fabricant || null,
      fabricantSlug: slugify(p.fabricant || ""),
      marque: p.marque || null,
      gamme: p.gamme || null,
      gammeSlug: slugify(p.gamme || ""),
      saveur: p.saveur || null,
      format: format.code,
      formatLabel: format.label,
      formatStatus: format.status,
      contenanceRaw: format.sourceRaw,
      nicotine: isAmbiguous(p.nicotine) ? null : p.nicotine,
      pg: isAmbiguous(p.pg) ? null : p.pg,
      vg: isAmbiguous(p.vg) ? null : p.vg,
      type: isAmbiguous(p.type) ? null : p.type,
      ean: !isAmbiguous(p.ean) ? p.ean : !isAmbiguous(p.code_barres) ? p.code_barres : null,
      refFabricant: isAmbiguous(p.reference_fabricant) ? null : p.reference_fabricant,
      urlFabricant: isAmbiguous(p.url_fabricant) ? null : p.url_fabricant,
      niveauConfiance: p.niveau_confiance || null,
      statusEnrichissement: p.status_enrichissement || null,
      catalogStatus,
      sumup: {
        status: sumupStatus,
        idSumup: sumupId,
        variantId: auto?.variant_id || aVal?.variant_id || null,
        nomSumup: auto?.nom_sumup || aVal?.nom_sumup || null,
        nomMaitre: auto?.nom_maitre || aVal?.nom_maitre || null,
        eanSumup: auto?.ean_sumup || aVal?.ean_sumup || null,
        prixSumup: auto?.prix_sumup || aVal?.prix_sumup || null,
        famille: auto?.famille || aVal?.famille || null,
        score: auto?.score || aVal?.score || null,
        raison: auto?.raison || aVal?.raison || null,
        inImportFinal: sumupId ? importSumupIds.has(sumupId) : false,
      },
      photo: {
        status: photoStatus,
        sourceType: photoRow?.sourceType || null,
        source: photoRow?.source || null,
        amelioree: photoRow?.imageAmelioree === "oui",
        publicUrl: photoRow?.publicUrl || db?.imageUrl || null,
        anomalies: photoRow?.anomalies || [],
      },
      db: db
        ? {
            productId: db.id,
            slug: db.slug,
            imageStatus: db.imageStatus,
            visibleOnline: db.visibleOnline,
            productType: db.productType,
            productFamily: db.productFamily,
          }
        : null,
      anomalies,
    };
  });

  // 4. PHOTOS
  const photos = {
    date: new Date().toISOString(),
    perimetre: "tous les produits MASTER (127) + état photothèque des 91 validés",
    officielles: produits.filter((p) => p.photo.status === "officielle").length,
    manquantes: produits.filter((p) => p.photo.status === "manquante").length,
    aVerifier: produits.filter((p) => p.photo.status === "a_verifier").length,
    validesAvecPhoto: produits.filter((p) => p.catalogStatus === "valide" && p.photo.status === "officielle")
      .length,
    validesSansPhoto: produits.filter((p) => p.catalogStatus === "valide" && p.photo.status !== "officielle")
      .length,
    items: produits.map((p) => ({
      idMaster: p.idMaster,
      nom: p.nom,
      fabricant: p.fabricant,
      gamme: p.gamme,
      format: p.format,
      catalogStatus: p.catalogStatus,
      photoStatus: p.photo.status,
      sourceType: p.photo.sourceType,
      source: p.photo.source,
      amelioree: p.photo.amelioree,
      publicUrl: p.photo.publicUrl,
      anomalies: [...p.photo.anomalies, ...(p.photo.status === "manquante" ? ["photo_manquante"] : [])],
    })),
  };
  writeJson("04_PHOTOS.json", photos);
  console.log(
    `4. Photos : ${photos.officielles} officielles / ${photos.manquantes} manquantes (validés: ${photos.validesAvecPhoto} ok, ${photos.validesSansPhoto} manquantes)`
  );

  // 5. SUMUP
  const sumup = {
    date: new Date().toISOString(),
    sources: {
      matchAuto: path.join(MASTER_ROOT, "sumup_match", "MATCH_AUTO.csv"),
      matchAValider: path.join(MASTER_ROOT, "sumup_match", "MATCH_A_VALIDER.csv"),
      absents: path.join(MASTER_ROOT, "sumup_match", "MASTER_ABSENTS_DE_SUMUP.csv"),
      importFinal: path.join(MASTER_ROOT, "IMPORT_SUMUP_FINAL.csv"),
    },
    synthetique: {
      masterProducts: productsRaw.length,
      matchAuto: matchAuto.length,
      matchAValider: matchAValider.length,
      absentsDeSumup: absentsMaster.length,
      importFinalRows: importFinal.length,
      couvertureAutoPct: Math.round((matchAuto.length / Math.max(productsRaw.length, 1)) * 1000) / 10,
    },
    matchAuto: matchAuto.map((r) => ({
      idMaster: r.id_all_vaps,
      idSumup: r.id_sumup,
      variantId: r.variant_id,
      nomSumup: r.nom_sumup,
      nomMaitre: r.nom_maitre,
      eanSumup: r.ean_sumup || null,
      prix: r.prix_sumup,
      famille: r.famille,
      score: r.score,
      validation: r.validation,
      inImportFinal: importSumupIds.has(r.id_sumup),
      dbLie: !!dbBySumup.get(r.id_sumup),
    })),
    aValider: matchAValider.map((r) => ({
      idMaster: r.id_all_vaps,
      idSumup: r.id_sumup,
      nomSumup: r.nom_sumup,
      nomMaitre: r.nom_maitre,
      raison: r.raison,
      score: r.score,
      validation: r.validation,
    })),
    absentsMaster: absentsMaster.map((r) => ({
      idMaster: r.id_all_vaps,
      nom: r.nom || r.nom_maitre || null,
      fabricant: r.fabricant || null,
      gamme: r.gamme || null,
    })),
    ecartsDb: {
      dbValides: dbProducts.length,
      matchAutoSansDb: matchAuto.filter((r) => !dbBySumup.get(r.id_sumup)).map((r) => r.nom_maitre || r.id_all_vaps),
      dbValidesHorsMatchAuto: dbProducts
        .filter((p) => !p.sumupProductId || !matchAuto.some((m) => m.id_sumup === p.sumupProductId))
        .map((p) => ({ name: p.name, sumupProductId: p.sumupProductId })),
    },
  };
  writeJson("05_SUMUP.json", sumup);
  console.log(
    `5. SumUp : auto=${sumup.synthetique.matchAuto} a_valider=${sumup.synthetique.matchAValider} absents=${sumup.synthetique.absentsDeSumup}`
  );

  // 6. PRODUITS + ARBRE
  writeJson("06_PRODUITS.json", {
    date: new Date().toISOString(),
    total: produits.length,
    valide: produits.filter((p) => p.catalogStatus === "valide").length,
    aVerifier: produits.filter((p) => p.catalogStatus === "a_verifier").length,
    horsSumup: produits.filter((p) => p.catalogStatus === "hors_sumup").length,
    items: produits,
  });

  type Leaf = (typeof produits)[number];
  const arbre: Record<
    string,
    {
      fabricant: string;
      slug: string;
      status: string;
      gammes: Record<
        string,
        {
          gamme: string;
          slug: string;
          formats: Record<
            string,
            {
              format: string;
              produits: Array<{
                idMaster: string;
                nom: string;
                catalogStatus: string;
                photoStatus: string;
                sumupStatus: string;
                anomalies: string[];
              }>;
            }
          >;
        }
      >;
    }
  > = {};

  for (const p of produits) {
    const fKey = p.fabricantSlug || "a-verifier";
    const gKey = p.gammeSlug || "a-verifier";
    const fmtKey = p.format || "format-a-verifier";
    if (!arbre[fKey]) {
      const fab = fabricants.find((f) => f.slug === fKey || slugify(f.nom) === fKey);
      arbre[fKey] = {
        fabricant: p.fabricant || "À vérifier",
        slug: fKey,
        status: fab?.status || "a_verifier",
        gammes: {},
      };
    }
    if (!arbre[fKey].gammes[gKey]) {
      arbre[fKey].gammes[gKey] = {
        gamme: p.gamme || "À vérifier",
        slug: gKey,
        formats: {},
      };
    }
    if (!arbre[fKey].gammes[gKey].formats[fmtKey]) {
      arbre[fKey].gammes[gKey].formats[fmtKey] = { format: fmtKey, produits: [] };
    }
    arbre[fKey].gammes[gKey].formats[fmtKey].produits.push({
      idMaster: p.idMaster,
      nom: p.nom,
      catalogStatus: p.catalogStatus,
      photoStatus: p.photo.status,
      sumupStatus: p.sumup.status,
      anomalies: p.anomalies,
    });
  }

  writeJson("07_ARBRE.json", {
    date: new Date().toISOString(),
    hierarchy: "fabricant → gamme → format → produit",
    tree: arbre,
  });
  console.log(`6. Produits : ${produits.length} | Arbre fabricants : ${Object.keys(arbre).length}`);

  // Marques MASTER
  writeJson("00_MARQUES.json", {
    date: new Date().toISOString(),
    total: brandsRaw.length,
    items: brandsRaw,
  });
  writeJson("00_SAVEURS.json", {
    date: new Date().toISOString(),
    total: flavoursRaw.length,
    items: flavoursRaw,
  });
  writeJson("00_EAN.json", {
    date: new Date().toISOString(),
    connus: eanKnown.length,
    aCompleter: eanTodo.length,
    connusItems: eanKnown,
  });

  // INDEX markdown
  const valides = produits.filter((p) => p.catalogStatus === "valide");
  const md = `# Référentiel catalogue All Vap's

Date : ${new Date().toISOString()}

> Source de vérité données — **aucune page front générée**.
> Ambigu / manquant → **a_verifier** (jamais inventé).

## Ordre de construction

| # | Étape | Fichier | Statut |
|---|---|---|---|
| 1 | Fabricants | \`01_FABRICANTS.json\` | ✅ ${fabricants.length} |
| 2 | Gammes | \`02_GAMMES.json\` | ✅ ${gammes.length} |
| 3 | Formats | \`03_FORMATS.json\` | ✅ ${formats.length} |
| 4 | Photos | \`04_PHOTOS.json\` | ✅ |
| 5 | SumUp | \`05_SUMUP.json\` | ✅ |
| 6 | Produits + arbre | \`06_PRODUITS.json\`, \`07_ARBRE.json\` | ✅ |
| 7–11 | Pages Fabricant / Gamme / Format / Produit / Home | — | ⏸ **bloqué jusqu'à validation données** |

## Synthèse

| Indicateur | Valeur |
|---|---|
| Fabricants | ${fabricants.length} (vérifiés ${fabricants.filter((f) => f.status === "verifie").length}, partiels ${fabricants.filter((f) => f.status === "partiel").length}, à vérifier ${fabricants.filter((f) => f.status === "a_verifier").length}) |
| Gammes | ${gammes.length} |
| Formats référencés | ${formats.map((f) => f.code).join(", ")} |
| Produits MASTER | ${produits.length} |
| Match SumUp AUTO (validés) | ${valides.length} |
| SumUp à valider | ${matchAValider.length} |
| Absents de SumUp | ${absentsMaster.length} |
| Photos officielles (validés) | ${photos.validesAvecPhoto} / ${valides.length} |
| Validés sans photo | ${photos.validesSansPhoto} |
| Validés sans format clair | ${valides.filter((p) => p.formatStatus !== "valide").length} |
| EAN connus MASTER | ${eanKnown.length} |
| EAN à compléter | ${eanTodo.length} |

## Arbre (validés uniquement)

${Object.values(arbre)
  .map((fab) => {
    const lines: string[] = [`### ${fab.fabricant} (\`${fab.slug}\`) — ${fab.status}`];
    for (const g of Object.values(fab.gammes)) {
      lines.push(`- **${g.gamme}**`);
      for (const fmt of Object.values(g.formats)) {
        const ok = fmt.produits.filter((x) => x.catalogStatus === "valide");
        if (!ok.length) continue;
        lines.push(
          `  - \`${fmt.format}\` — ${ok.length} validé(s) ; photos ${ok.filter((x) => x.photoStatus === "officielle").length}/${ok.length}`
        );
        for (const pr of ok) {
          const flag = pr.anomalies.length ? ` ⚠ ${pr.anomalies.join(", ")}` : "";
          lines.push(`    - ${pr.nom} [${pr.photoStatus}]${flag}`);
        }
      }
    }
    return lines.join("\n");
  })
  .join("\n\n")}

## Règles

1. Ne jamais inventer fabricant / gamme / format / photo / nom.
2. SumUp : seuls les \`MATCH_AUTO\` ∩ \`IMPORT_SUMUP_FINAL\` sont \`valide\`.
3. \`MATCH_A_VALIDER\` et absents restent hors publication.
4. Photo : officielle locale ou site fabricant uniquement ; sinon manquante.
5. Front (étapes 7–11) uniquement après validation de ce référentiel.

## Prochaine étape données

Synchroniser ce référentiel vers PostgreSQL (\`Brand\` / gammes / \`productType\` / liens) **sans publier de pages**.
`;

  fs.writeFileSync(path.join(OUT, "INDEX.md"), md, "utf8");

  // Snapshot machine pour sync DB ultérieure
  writeJson("REFERENTIEL_META.json", {
    date: new Date().toISOString(),
    version: 1,
    masterRoot: MASTER_ROOT,
    out: OUT,
    counts: {
      fabricants: fabricants.length,
      gammes: gammes.length,
      formats: formats.length,
      produits: produits.length,
      valides: valides.length,
      photosValides: photos.validesAvecPhoto,
    },
    frontBloque: true,
    message: "Pages Fabricant/Gamme/Format/Produit/Home interdites tant que référentiel non validé.",
  });

  console.log(`\n✅ Référentiel écrit dans ${OUT}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
