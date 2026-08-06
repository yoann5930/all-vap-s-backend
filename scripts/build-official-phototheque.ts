#!/usr/bin/env tsx
/**
 * Photothèque officielle All Vap's — 91 produits validés.
 *
 * Priorité :
 * 1. Packshots locaux Fabricants/ (déjà validés)
 * 2. Site officiel fabricant uniquement
 * 3. Sinon : sans photo + rapport
 *
 * Amélioration autorisée : fond premium All Vap's, netteté, luminosité,
 * contraste, résolution, détourage soft via trim — JAMAIS le packaging.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";

const DOSSIER =
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet";
const LOCAL_PACKSHOTS = path.join(DOSSIER, "Fabricants/Liquidarom/Packshots");
const MEDIA_ROOT = path.resolve("public/media/products");
const REPORT_JSON = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");
const REPORT_MD = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.md");

const OFFICIAL_SITES: Record<string, { manufacturer: string; base: string; seeds: string[] }> = {
  ICE_COOL: {
    manufacturer: "liquidarom",
    base: "https://www.liquidarom.com",
    seeds: ["/266-ice-cool", "/261-e-liquides", "/"],
  },
  ICE_COOL_X: {
    manufacturer: "liquidarom",
    base: "https://www.liquidarom.com",
    seeds: ["/266-ice-cool", "/261-e-liquides", "/"],
  },
  LES_COLLEGUES: {
    manufacturer: "liquidarom",
    base: "https://www.liquidarom.com",
    seeds: ["/360-e-liquide-les-collegues", "/261-e-liquides", "/"],
  },
  LES_ESSENTIELS: {
    manufacturer: "liquidarom",
    base: "https://www.liquidarom.com",
    seeds: ["/263-les-essentiels", "/261-e-liquides", "/"],
  },
  ENFER: {
    manufacturer: "vape47",
    base: "https://order.vape47.com",
    seeds: ["/eliquid-enfer/5968-7998-enfer-original-0mg-ml-50ml.html"],
  },
  FURIOSA_EGGZ: {
    manufacturer: "vape47",
    base: "https://order.vape47.com",
    seeds: [],
  },
  FURIOSA_SKINZ: {
    manufacturer: "vape47",
    base: "https://order.vape47.com",
    seeds: [],
  },
  INVAPABLE: {
    manufacturer: "vape47",
    base: "https://order.vape47.com",
    seeds: [],
  },
  KYOTO_STORM: {
    manufacturer: "raneki-liquide",
    base: "https://www.ranekiliquide.com",
    seeds: ["/", "/collections/all", "/collections/kyoto-storm", "/pages/kyoto-storm"],
  },
  OLYMPE: {
    manufacturer: "raneki-liquide",
    base: "https://www.ranekiliquide.com",
    seeds: ["/", "/collections/all", "/collections/olympe", "/pages/olympe"],
  },
  MAMITA: {
    manufacturer: "biarritz-lab",
    base: "https://biarritz-lab.com",
    seeds: ["/collections/mamita", "/collections/all", "/"],
  },
  CALL_OF_VAPE: {
    manufacturer: "cloud-vapor",
    base: "https://www.cloud-vapor.com",
    seeds: ["/", "/collections/all", "/collections/call-of-vape"],
  },
};

type ReportRow = {
  productId: string;
  name: string;
  family: string;
  manufacturer: string;
  range: string;
  format: string;
  barcode: string | null;
  photoOfficielleTrouvee: "oui" | "non";
  source: string | null;
  sourceType: "local_packshot" | "fabricant_officiel" | "aucune" | null;
  imageAmelioree: "oui" | "non";
  mediaPath: string | null;
  publicUrl: string | null;
  imageManquante: boolean;
  anomalies: string[];
  matchScore?: number;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length > 1 && !["ml", "mg", "0mg", "00mg", "omg", "eliquide", "e", "liquide", "by", "the", "de", "la", "le", "et"].includes(t));
}

function slugify(s: string): string {
  return norm(s).replace(/\s+/g, "-").slice(0, 80) || "produit";
}

function detectFormat(category: string, name: string): string {
  const t = `${category} ${name}`.toLowerCase();
  if (/\b100\s*ml\b|09\.e-liquide 100/.test(t)) return "100ml";
  if (/\b10\s*ml\b/.test(t)) return "10ml";
  if (/\b30\s*ml\b/.test(t)) return "30ml";
  return "50ml";
}

/** Extrait le format annoncé dans une URL / titre / nom de fichier. */
function extractDeclaredFormat(text: string): string | null {
  const t = text.toLowerCase().replace(/_/g, "-");
  if (/\b200[\s-]*ml\b/.test(t)) return "200ml";
  if (/\b100[\s-]*ml\b/.test(t)) return "100ml";
  if (/\b30[\s-]*ml\b/.test(t)) return "30ml";
  if (/\b10[\s-]*ml\b/.test(t)) return "10ml";
  if (/\b50[\s-]*ml\b/.test(t)) return "50ml";
  return null;
}

/**
 * Rejette une source si elle déclare explicitement un autre format
 * que celui du produit (ex. Pastis 13 10ml pour un SKU 50ml).
 */
function formatMismatch(expectedFormat: string, ...texts: string[]): boolean {
  const declared = texts.map(extractDeclaredFormat).find(Boolean) || null;
  if (!declared) return false;
  return declared !== expectedFormat;
}

function manufacturerFromFamily(family: string): string {
  return OFFICIAL_SITES[family]?.manufacturer || family.toLowerCase().replace(/_/g, "-");
}

function rangeFolder(family: string): string {
  return family.toLowerCase().replace(/_/g, "-");
}

function flavorKey(name: string, family: string): string {
  let n = name;
  n = n.replace(/liquidarom|raneki\s*liquide|vape\s*47|cloud\s*vapor|the\s*mds\s*juice|mds\s*juice|icebreak|juice\s*66|furiosa|cookin\s*cloud/gi, "");
  n = n.replace(/ice\s*cool\s*x|ice\s*cool|les\s*collegues|les\s*essentiels|enfer|olympe|kyoto\s*storm|mamita|l'?invapable|eggz\s*v2|skinz|call\s*of\s*vape/gi, "");
  n = n.replace(/\b\d+\s*ml\b/gi, "").replace(/\b\d+\s*mg\b/gi, "").replace(/\b0+\s*mg\b/gi, "");
  n = n.replace(/saveur\s*boisson/gi, "");
  return norm(n) || norm(name);
}

function scoreFilename(productFlavor: string, filename: string): number {
  const ft = tokens(productFlavor);
  const fn = norm(filename.replace(/\.(jpe?g|png|webp)$/i, "").replace(/^packshot_e_liquide_|^packshot_|^thumb_/i, ""));
  if (!ft.length) return 0;
  const hits = ft.filter((t) => fn.includes(t)).length;
  const base = hits / ft.length;
  // Bonus si presque tous les tokens présents
  let score = base * 100;
  if (hits === ft.length) score += 20;
  // Pénalité formats 10ml si on cherche 50ml dans le nom fichier
  if (/10ml/.test(fn) && !/10ml/.test(productFlavor)) score -= 30;
  return score;
}

const LIQUIDAROM_FAMILIES = new Set(["ICE_COOL", "ICE_COOL_X", "LES_COLLEGUES", "LES_ESSENTIELS"]);

function findBestLocalPackshot(productName: string, family: string, format: string): { file: string; score: number } | null {
  // Packshots locaux = Liquidarom uniquement — jamais pour Vape47 / Raneki / etc.
  if (!LIQUIDAROM_FAMILIES.has(family)) return null;
  if (!fs.existsSync(LOCAL_PACKSHOTS)) return null;
  const files = fs.readdirSync(LOCAL_PACKSHOTS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const flavor = flavorKey(productName, family);
  const flavorToks = tokens(flavor);
  let best: { file: string; score: number } | null = null;
  for (const f of files) {
    // Rejet dur : mauvais format (10ml / 200ml pour un 50ml, etc.)
    if (formatMismatch(format, f)) continue;
    let s = scoreFilename(flavor, f);
    const fn = norm(f);
    // Tous les tokens saveur doivent matcher (évite dragon→cactus fruit du dragon, fraise→fraise framboise…)
    const hitToks = flavorToks.filter((t) => fn.includes(t));
    if (flavorToks.length >= 2 && hitToks.length < Math.ceil(flavorToks.length * 0.8)) {
      s -= 40;
    }
    if (format === "50ml" && /50ml/i.test(f)) s += 8;
    if (format === "10ml" && /10ml/i.test(f)) s += 8;
    if (format === "50ml" && /10ml/i.test(f)) s -= 25;
    if (/E_liquide/i.test(f)) s += 5;
    if (/_\d\.jpg$/i.test(f)) s -= 5;
    // Ice Cool X : "mix fruits rouges" ≠ "extra fruits rouges"
    if (family === "ICE_COOL_X" && /mix/.test(flavor) && /extra/.test(fn)) s -= 50;
    if (family === "ICE_COOL" && /extra/.test(flavor) && /mix/.test(fn)) s -= 50;
    if (!best || s > best.score) best = { file: path.join(LOCAL_PACKSHOTS, f), score: s };
  }
  if (!best || best.score < 85) return null;
  return best;
}

/** Fond premium All Vap's — style e-tasty obligatoire (module partagé). */
async function enhanceToAllVapsStyle(inputBuffer: Buffer, outPath: string): Promise<void> {
  const { normalizeProductImageToEtastyStyle } = await import(
    "../lib/catalog/normalize-product-image"
  );
  const flavorHint = outPath;
  const keepNativeFruits = /e-tasty|etasty/i.test(outPath);
  await normalizeProductImageToEtastyStyle({
    inputBuffer,
    outPath,
    flavorHint,
    keepNativeFruits,
  });
}

const linkCache = new Map<string, Array<{ url: string; title: string }>>();

async function discoverOfficialLinks(family: string): Promise<Array<{ url: string; title: string }>> {
  const cfg = OFFICIAL_SITES[family];
  if (!cfg) return [];
  if (linkCache.has(cfg.manufacturer)) return linkCache.get(cfg.manufacturer)!;

  const links = new Map<string, { url: string; title: string }>();
  for (const seed of cfg.seeds) {
    const seedUrl = seed.startsWith("http") ? seed : `${cfg.base}${seed}`;
    try {
      const res = await fetch(seedUrl, {
        headers: { "User-Agent": "AllVapsOfficialPhotoBot/1.0 (+local catalog)" },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const re = /href="([^"]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        let href = m[1];
        if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
        if (href.startsWith("/")) href = `${cfg.base}${href}`;
        if (!href.startsWith(cfg.base)) continue;
        if (!/(product|produit|\.html|e-liquide|eliquide|50-ml|50ml|100-ml|100ml|enfer|furiosa|olympe|kyoto|mamita|ice-cool|collegue|essentiel|aria|doom|nova|juno|volta|griffon|aphrodite|athena|zeus|poseidon|hades|akashi|hanzo|ryujin)/i.test(href)) {
          continue;
        }
        const title = decodeURIComponent(href.split("/").pop() || href);
        links.set(href, { url: href, title });
      }
    } catch {
      /* seed fail ok */
    }
  }
  const arr = [...links.values()];
  linkCache.set(cfg.manufacturer, arr);
  return arr;
}

async function extractOfficialImage(pageUrl: string, base: string): Promise<{ imageUrl: string; title: string } | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "AllVapsOfficialPhotoBot/1.0 (+local catalog)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch =
      html.match(/<h1[^>]*>([^<]+)</i) ||
      html.match(/property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<title>([^<|<]+)/i);
    const title = (titleMatch?.[1] || "").trim();
    const imgMatch =
      html.match(/property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/id="bigpic"[^>]+src="([^"]+)"/i) ||
      html.match(/data-image-large-src="([^"]+)"/i) ||
      html.match(/class="[^"]*product[^"]*"[^>]+src="(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    if (!imgMatch) return null;
    let imageUrl = imgMatch[1];
    if (imageUrl.startsWith("//")) imageUrl = `https:${imageUrl}`;
    else if (imageUrl.startsWith("/")) imageUrl = `${base}${imageUrl}`;
    // Refuser CDN revendeurs connus
    if (/amazon|cdiscount|aliexpress|lepetitvapoteur|cigaretteelec|vapoteuse|shopifycdn\.com\/s\/files\/1\/0/i.test(imageUrl)) {
      return null;
    }
    return { imageUrl, title };
  } catch {
    return null;
  }
}

function scorePage(productName: string, pageTitle: string, pageUrl: string): number {
  const pt = tokens(productName);
  const hay = norm(`${pageTitle} ${pageUrl}`);
  if (!pt.length) return 0;
  const hits = pt.filter((t) => hay.includes(t)).length;
  let score = (hits / pt.length) * 100;
  // Alias connus (apostrophes / orthographes officielles)
  if (/ptit|p.?tit/.test(norm(productName)) && /ptit|p.?tit|petit/.test(hay)) score = Math.max(score, 95);
  if (/pastis/.test(norm(productName)) && /pastis/.test(hay)) score = Math.max(score, 95);
  if (/baleze|baleze/.test(norm(productName)) && /baleze|baleze/.test(hay)) score = Math.max(score, 95);
  if (/\bmimi\b/.test(norm(productName)) && /\bmimi\b/.test(hay)) score = Math.max(score, 95);
  if (/coquette/.test(norm(productName)) && /coquette/.test(hay)) score = Math.max(score, 95);
  if (/charmeur/.test(norm(productName)) && /charmeur/.test(hay)) score = Math.max(score, 95);
  // Vape47 Enfer Original
  if (/enfer/.test(norm(productName)) && /original/.test(norm(productName)) && /enfer/.test(hay) && /original/.test(hay)) {
    score = Math.max(score, 95);
  }
  // Refuser mismatch évident (ex. page Pink pour produit Blue)
  const colors = ["blue", "red", "green", "yellow", "purple", "mango", "pink", "original"];
  for (const c of colors) {
    if (new RegExp(`\\b${c}\\b`).test(norm(productName)) && !new RegExp(`\\b${c}\\b`).test(hay)) {
      // si le produit a une couleur précise absente du titre → pénalité
      if (colors.some((o) => o !== c && new RegExp(`\\b${o}\\b`).test(hay))) score -= 50;
    }
  }
  return score;
}

/** Recherche Prestashop Liquidarom — source officielle pour Collègues / Essentiels / Ice Cool */
async function searchLiquidarom(productName: string): Promise<Array<{ url: string; title: string }>> {
  const q = encodeURIComponent(
    productName
      .replace(/les\s+coll[eè]gues/gi, "")
      .replace(/les\s+essentiels/gi, "")
      .replace(/ice\s*cool\s*x?/gi, "")
      .replace(/liquidarom/gi, "")
      .trim() || productName
  );
  const url = `https://www.liquidarom.com/recherche?controller=search&s=${q}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AllVapsOfficialPhotoBot/1.0 (+local catalog)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const links = new Map<string, { url: string; title: string }>();
    const re = /href="(\/[^"#?]+\.html)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const href = `https://www.liquidarom.com${m[1]}`;
      links.set(href, { url: href, title: decodeURIComponent(m[1]) });
    }
    // Titles from product cards
    const titleRe = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)/gi;
    while ((m = titleRe.exec(html))) {
      let href = m[1];
      if (href.startsWith("/")) href = `https://www.liquidarom.com${href}`;
      links.set(href, { url: href, title: m[2].trim() });
    }
    return [...links.values()];
  } catch {
    return [];
  }
}

async function fetchOfficialForProduct(
  name: string,
  family: string,
  format: string
): Promise<{ buffer: Buffer; sourceUrl: string; pageUrl: string; score: number } | null> {
  const cfg = OFFICIAL_SITES[family];
  if (!cfg) return null;

  let links = await discoverOfficialLinks(family);
  // Enrichissement Liquidarom via recherche officielle
  if (cfg.manufacturer === "liquidarom") {
    const searched = await searchLiquidarom(name);
    const map = new Map(links.map((l) => [l.url, l]));
    for (const s of searched) map.set(s.url, s);
    links = [...map.values()];
  }

  const ranked = links
    .map((l) => ({ ...l, score: scorePage(name, l.title, l.url) }))
    .filter((l) => l.score >= 70)
    .filter((l) => !formatMismatch(format, l.title, l.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const cand of ranked) {
    const extracted = await extractOfficialImage(cand.url, cfg.base);
    if (!extracted) continue;
    if (formatMismatch(format, extracted.title, cand.url, extracted.imageUrl)) continue;
    const titleScore = scorePage(name, extracted.title, cand.url);
    if (titleScore < 70) continue;
    // Vérifier que le fichier image reflète aussi le produit (évite Blue→Pink)
    const imgScore = scorePage(name, extracted.title, extracted.imageUrl);
    if (imgScore < 50 && /enfer|red|green|yellow|purple|mango|pink|original/.test(norm(name))) {
      if (imgScore < titleScore - 30) continue;
    }
    try {
      const imgRes = await fetch(extracted.imageUrl, {
        headers: { "User-Agent": "AllVapsOfficialPhotoBot/1.0 (+local catalog)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!imgRes.ok) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length < 5_000) continue;
      return { buffer: buf, sourceUrl: extracted.imageUrl, pageUrl: cand.url, score: titleScore };
    } catch {
      continue;
    }
  }
  return null;
}

async function attachToProduct(productId: string, publicUrl: string, alt: string) {
  const existing = await prisma.productImage.findFirst({
    where: { productId, url: publicUrl },
  });
  if (!existing) {
    await prisma.productImage.create({
      data: {
        productId,
        url: publicUrl,
        status: "official",
        sortOrder: 0,
        alt,
      },
    });
  } else {
    await prisma.productImage.update({
      where: { id: existing.id },
      data: { status: "official", alt },
    });
  }
  await prisma.product.update({
    where: { id: productId },
    data: {
      imageUrl: publicUrl,
      imageStatus: "official",
      images: { set: [publicUrl] },
    },
  });
}

async function main() {
  console.log("=== Photothèque officielle All Vap's (91 validés) ===\n");
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.mkdirSync(MEDIA_ROOT, { recursive: true });

  const products = await prisma.product.findMany({
    where: { catalogStatus: "valide" },
    orderBy: [{ productFamily: "asc" }, { name: "asc" }],
  });
  console.log(`Produits validés : ${products.length}`);

  const rows: ReportRow[] = [];
  let found = 0;
  let enhanced = 0;
  let missing = 0;

  for (const p of products) {
    const family = p.productFamily || "AUTRES";
    const manufacturerSlug = p.brand ? slugify(p.brand) : manufacturerFromFamily(family);
    const range = p.range ? slugify(p.range) : rangeFolder(family);
    const format = p.productType || detectFormat(p.category, p.name);
    const slug = slugify(flavorKey(p.name, family)) || slugify(p.name);
    const relDir = `${manufacturerSlug}/${range}/${format}`;
    const absDir = path.join(MEDIA_ROOT, relDir);
    const outFile = path.join(absDir, `${slug}.webp`);
    const publicUrl = `/media/products/${relDir}/${slug}.webp`;
    const anomalies: string[] = [];
    const report: ReportRow = {
      productId: p.id,
      name: p.name,
      family,
      manufacturer: manufacturerSlug,
      range,
      format,
      barcode: p.barcode,
      photoOfficielleTrouvee: "non",
      source: null,
      sourceType: "aucune",
      imageAmelioree: "non",
      mediaPath: null,
      publicUrl: null,
      imageManquante: true,
      anomalies,
    };

    try {
      // 1) Local packshot
      let buffer: Buffer | null = null;
      const local = findBestLocalPackshot(p.name, family, format);
      if (local) {
        buffer = fs.readFileSync(local.file);
        report.source = local.file;
        report.sourceType = "local_packshot";
        report.matchScore = Math.round(local.score);
        report.photoOfficielleTrouvee = "oui";
      } else {
        // 2) Official manufacturer only
        const fetched = await fetchOfficialForProduct(p.name, family, format);
        if (fetched) {
          buffer = fetched.buffer;
          report.source = fetched.sourceUrl;
          report.sourceType = "fabricant_officiel";
          report.matchScore = Math.round(fetched.score);
          report.photoOfficielleTrouvee = "oui";
          // conserver raw
          const rawDir = path.join(MEDIA_ROOT, "_raw", manufacturerSlug, range);
          fs.mkdirSync(rawDir, { recursive: true });
          const ext = fetched.sourceUrl.match(/\.(jpe?g|png|webp)/i)?.[1] || "jpg";
          fs.writeFileSync(path.join(rawDir, `${slug}.${ext}`), buffer);
        } else if (!OFFICIAL_SITES[family]) {
          anomalies.push("site_fabricant_non_reference_ou_non_fiable");
        } else {
          anomalies.push("aucune_photo_officielle_fiable");
        }
      }

      if (buffer) {
        await enhanceToAllVapsStyle(buffer, outFile);
        report.imageAmelioree = "oui";
        report.mediaPath = outFile;
        report.publicUrl = publicUrl;
        report.imageManquante = false;
        await attachToProduct(p.id, publicUrl, p.name);
        found++;
        enhanced++;
        console.log(`✓ ${p.name} ← ${report.sourceType} (${report.matchScore ?? "?"})`);
      } else {
        missing++;
        // Ne pas inventer : s'assurer qu'aucune fausse image n'est liée
        if (p.imageUrl && /unsplash|placeholder|lorem/i.test(p.imageUrl)) {
          await prisma.product.update({
            where: { id: p.id },
            data: { imageUrl: null, imageStatus: "pending", images: { set: [] } },
          });
          anomalies.push("placeholder_supprime");
        }
        console.log(`✗ ${p.name} — photo manquante`);
      }
    } catch (e: any) {
      anomalies.push(`erreur: ${(e?.message || String(e)).slice(0, 120)}`);
      missing++;
      console.error(`! ${p.name}:`, e?.message);
    }

    rows.push(report);
  }

  const summary = {
    date: new Date().toISOString(),
    totalValides: products.length,
    photosTrouvees: found,
    photosAmeliorees: enhanced,
    photosManquantes: missing,
    couverturePct: Math.round((found / Math.max(products.length, 1)) * 1000) / 10,
    mediaRoot: MEDIA_ROOT,
    regles: [
      "Sources locales Fabricants prioritaires",
      "Sinon site officiel fabricant uniquement",
      "Jamais revendeur / autre fabricant / image générée",
      "Fond premium All Vap's sans altérer le packaging",
    ],
    produits: rows,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), "utf8");

  const md = `# Rapport photothèque officielle All Vap's

Date : ${summary.date}

## Synthèse

| Métrique | Valeur |
|---|---|
| Produits validés | ${summary.totalValides} |
| Photos officielles trouvées | ${summary.photosTrouvees} |
| Images améliorées (fond All Vap's) | ${summary.photosAmeliorees} |
| Images manquantes | ${summary.photosManquantes} |
| Couverture | ${summary.couverturePct} % |
| Médiathèque | \`public/media/products/{fabricant}/{gamme}/{format}/\` |

## Détail par produit

| Produit | Famille | Photo | Source | Améliorée | Manquante | Anomalies |
|---|---|---|---|---|---|---|
${rows
  .map(
    (r) =>
      `| ${r.name.replace(/\|/g, "/")} | ${r.family} | ${r.photoOfficielleTrouvee} | ${
        r.sourceType || "—"
      } | ${r.imageAmelioree} | ${r.imageManquante ? "oui" : "non"} | ${(r.anomalies.join("; ") || "—").replace(/\|/g, "/")} |`
  )
  .join("\n")}

## Manquants (action requise)

${rows
  .filter((r) => r.imageManquante)
  .map((r) => `- **${r.name}** (${r.family}) — ${r.anomalies.join(", ") || "aucune source officielle"}`)
  .join("\n") || "_Aucun_"}
`;

  fs.writeFileSync(REPORT_MD, md, "utf8");
  console.log(`\n=== Couverture ${summary.couverturePct}% — ${found}/${products.length} ===`);
  console.log(`Rapport : ${REPORT_MD}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
