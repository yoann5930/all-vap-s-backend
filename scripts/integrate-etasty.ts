/**
 * Intégration fabricant e.Tasty dans le catalogue existant.
 *
 * - Aucune invention : gammes uniquement si libellé SumUp clair OU match officiel One Taste 10ml
 * - Photos : site officiel pro.e-tasty.fr uniquement
 * - Prix / stocks : déjà en DB (SumUp read-only) — on ne touche pas SumUp
 * - Incomplete → catalogStatus=a_verifier, visibleOnline=false
 * - Aucun changement graphique
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";

const MEDIA_ROOT = path.resolve("public/media/products/e-tasty");
const REPORT_PATH = path.resolve("data/rebuild/RAPPORT_ETASTY.json");
const REPORT_MD = path.resolve("data/rebuild/RAPPORT_ETASTY.md");
const SCRAPE_PATH = path.resolve("data/rebuild/ETASTY_OFFICIAL_SCRAPE.json");

const OFFICIAL_RANGE_PAGES: Record<
  string,
  { path: string; name: string; slug: string; family: string; formatCodes: string[] }
> = {
  "one-taste": {
    path: "/15_one-taste",
    name: "One Taste",
    slug: "one-taste",
    family: "ETASTY_ONE_TASTE",
    formatCodes: ["10ml", "50ml"],
  },
  bankiz: {
    path: "/44_bankiz",
    name: "Bankiz",
    slug: "bankiz",
    family: "ETASTY_BANKIZ",
    formatCodes: ["10ml", "50ml"],
  },
  inspiration: {
    path: "/33_inspiration",
    name: "Inspiration",
    slug: "inspiration",
    family: "ETASTY_INSPIRATION",
    formatCodes: ["50ml"],
  },
  "god-fall-city": {
    path: "/92_godfall-city",
    name: "God Fall City",
    slug: "god-fall-city",
    family: "ETASTY_GOD_FALL_CITY",
    formatCodes: ["100ml"],
  },
  "smoke-wars": {
    path: "/4_smokewars",
    name: "Smoke Wars",
    slug: "smoke-wars",
    family: "ETASTY_SMOKE_WARS",
    formatCodes: ["10ml", "50ml"],
  },
  "gang-organise": {
    path: "/78_gang-organise",
    name: "Gang Organisé",
    slug: "gang-organise",
    family: "ETASTY_GANG_ORGANISE",
    formatCodes: ["10ml", "50ml"],
  },
  "freezy-crush": {
    path: "/16_freezy-crush",
    name: "Freezy Crush",
    slug: "freezy-crush",
    family: "ETASTY_FREEZY_CRUSH",
    formatCodes: ["50ml"],
  },
  numbers: {
    path: "/51_numbers",
    name: "Numbers",
    slug: "numbers",
    family: "ETASTY_NUMBERS",
    formatCodes: ["30ml"],
  },
  letters: {
    path: "/90_letters",
    name: "Letters",
    slug: "letters",
    family: "ETASTY_LETTERS",
    formatCodes: ["30ml"],
  },
  twenty: {
    path: "/91_twenty",
    name: "Twenty",
    slug: "twenty",
    family: "ETASTY_TWENTY",
    formatCodes: ["20ml"],
  },
};

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

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectFormat(name: string, category: string): string | null {
  const t = `${name} ${category}`.toLowerCase();
  if (/\b100\s*ml\b|09\.e-liquide\s*100/.test(t)) return "100ml";
  if (/\b70\s*ml\b/.test(t)) return "70ml";
  if (/\b50\s*ml\b|06\.e-liquide\s*50/.test(t)) return "50ml";
  if (/\b30\s*ml\b/.test(t)) return "30ml";
  if (/\b20\s*ml\b/.test(t)) return "20ml";
  if (/\b10\s*ml\b|05\.e-liquide\s*10/.test(t)) return "10ml";
  return null;
}

function detectNicotine(name: string): { mg: number | null; label: string | null } {
  const m = name.match(/\b(\d+)\s*mg\b/i);
  if (m) return { mg: Number(m[1]), label: `${m[1]} mg` };
  return { mg: null, label: null };
}

function isETasty(name: string): boolean {
  return /e[-\s]?tasty|etasty/i.test(name);
}

function isDiyBase(name: string, category: string): boolean {
  return /\bbase\b/i.test(name) || /18\.d\.?i\.?y/i.test(category);
}

/** Gamme explicitement nommée dans le libellé SumUp. */
function detectExplicitRange(name: string): keyof typeof OFFICIAL_RANGE_PAGES | null {
  if (/bankiz/i.test(name)) return "bankiz";
  if (/inspiration/i.test(name)) return "inspiration";
  if (/god\s*fall\s*city|godfallcity|godfall\s*city/i.test(name)) return "god-fall-city";
  if (/smoke\s*wars|smokewars/i.test(name)) return "smoke-wars";
  if (/gang\s*organis/i.test(name)) return "gang-organise";
  if (/one\s*taste/i.test(name)) return "one-taste";
  if (/freezy\s*crush/i.test(name)) return "freezy-crush";
  if (/numbers/i.test(name)) return "numbers";
  if (/letters/i.test(name)) return "letters";
  if (/\btwenty\b/i.test(name)) return "twenty";
  return null;
}

/** Corrections orthographiques SumUp connues (pas d'invention de saveur). */
function normalizeFlavorTypos(s: string): string {
  return s
    .replace(/\bcarnival\b/gi, "carnaval")
    .replace(/\bsauvege\b/gi, "sauvage")
    .replace(/\bpeche\b/gi, "peche")
    .replace(/\bcerise\s*noir\b/gi, "cerise noire");
}

/** Extrait un nom de saveur brut (sans marque/format/nicotine). */
function extractFlavorHint(name: string): string {
  let s = name
    .replace(/e[-\s]?tasty|etasty/gi, " ")
    .replace(/one\s*taste/gi, " ")
    .replace(
      /bankiz|inspiration|god\s*fall\s*city|godfallcity|smoke\s*wars|smokewars|gang\s*organis[eé]*|freezy\s*crush|numbers|letters|\btwenty\b/gi,
      " "
    )
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/\bsels?\s*(de\s*)?nicotine\b/gi, " ")
    .replace(/\bextra\s*frais\b/gi, " extra frais ")
    .replace(/[-_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeFlavorTypos(s);
}

type OfficialProduct = {
  title: string;
  imageUrl: string | null;
  productUrl: string | null;
  rangeKey: string;
  format: string | null;
  flavorKey: string;
};

function officialFlavorKey(title: string, rangeName: string): string {
  return norm(
    title
      .replace(new RegExp(rangeName, "ig"), " ")
      .replace(/one\s*taste/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " ")
      .replace(/sels?\s*(de\s*)?nicotine/gi, " ")
      .replace(/flacon|e-?liquide/gi, " ")
  );
}

function loadOfficialCatalog(): OfficialProduct[] {
  if (!fs.existsSync(SCRAPE_PATH)) return [];
  const scrape = JSON.parse(fs.readFileSync(SCRAPE_PATH, "utf8")) as {
    ranges: Array<{
      requested: { path: string; name: string; slug: string };
      status: number;
      products: Array<{ title: string; imageUrl: string | null; productUrl: string | null }>;
    }>;
  };

  const wantedPaths = new Set(Object.values(OFFICIAL_RANGE_PAGES).map((r) => r.path));
  const out: OfficialProduct[] = [];

  for (const r of scrape.ranges) {
    if (r.status !== 200) continue;
    if (!wantedPaths.has(r.requested.path)) continue;
    const rangeKey =
      Object.entries(OFFICIAL_RANGE_PAGES).find(([, v]) => v.path === r.requested.path)?.[0] ||
      null;
    if (!rangeKey) continue;
    const rangeMeta = OFFICIAL_RANGE_PAGES[rangeKey];
    for (const p of r.products) {
      // Filtrer les titres hors gamme (nav croisée)
      const t = norm(p.title);
      if (
        rangeKey === "one-taste" &&
        /(sels de nicotine|sel de nicotine)/.test(t) &&
        !/one taste|ananas|barbe|bonbon|cassis|cerise|citron|fraise|framboise|menthe|pasteque|cafe|caramel|cola|fruit|mangue|melon|myrtille|orange|passion|peche|poire|pomme|raisin|vanille|violette|banane|kiwi|litchi|mojito|bubble|tropical/.test(
          t
        )
      ) {
        // garder les sels One Taste si image OK — ne pas exclure systématiquement
      }
      // Exclure titres clairement d'une autre marque listée
      if (
        /gang organis|bankiz|inspiration|god fall|smoke wars|amalgam|amazone|freezy|call me biggy|deep seas|gameover|letters|numbers|shootiz|windy|summer spicy|maxis malins|cueillette|loly yumy/.test(
          t
        ) &&
        rangeKey === "one-taste" &&
        !/one taste/.test(t)
      ) {
        // One Taste pages sometimes list other brands in sidebars — skip if no flavor-like short title
        if (t.length < 3) continue;
      }
      if (rangeKey !== "gang-organise" && /gang organis/.test(t) && !norm(rangeMeta.name).split(" ").every((w) => t.includes(w))) {
        if (/^gang organis/.test(t)) continue;
      }
      out.push({
        title: p.title,
        imageUrl: p.imageUrl,
        productUrl: p.productUrl,
        rangeKey,
        format: detectFormat(p.title, ""),
        flavorKey: officialFlavorKey(p.title, rangeMeta.name),
      });
    }
  }
  return out;
}

function matchOfficial(
  official: OfficialProduct[],
  rangeKey: string,
  flavorHint: string,
  format: string | null
): OfficialProduct | null {
  const fk = norm(flavorHint);
  if (!fk || fk.length < 3) return null;
  const candidates = official.filter((o) => {
    if (o.rangeKey !== rangeKey) return false;
    if (format && o.format && o.format !== format) return false;
    return true;
  });

  // Exact / contains match on flavor keys
  let best: OfficialProduct | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    if (!c.flavorKey) continue;
    let score = 0;
    if (c.flavorKey === fk) score = 100;
    else if (c.flavorKey.includes(fk) || fk.includes(c.flavorKey)) score = 80;
    else {
      const a = new Set(fk.split(" "));
      const b = new Set(c.flavorKey.split(" "));
      const inter = [...a].filter((x) => b.has(x) && x.length > 2);
      if (inter.length === 0) continue;
      score = (inter.length / Math.max(a.size, b.size)) * 70;
    }
    // Prefer matching format
    if (format && c.format === format) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 55 ? best : null;
}

async function downloadOfficialImage(
  imageUrl: string,
  rangeSlug: string,
  format: string | null,
  productSlug: string
): Promise<string | null> {
  try {
    const dir = path.join(MEDIA_ROOT, rangeSlug, format || "unknown");
    fs.mkdirSync(dir, { recursive: true });
    const destRel = `/media/products/e-tasty/${rangeSlug}/${format || "unknown"}/${productSlug}.webp`;
    const destAbs = path.resolve("public", destRel.replace(/^\//, ""));
    if (fs.existsSync(destAbs) && fs.statSync(destAbs).size > 1000) return destRel;

    const prefer = imageUrl.replace("large_default", "thickbox_default").replace("home_default", "thickbox_default");
    const urls = [prefer, imageUrl];
    let buf: Buffer | null = null;
    for (const u of urls) {
      const res = await fetch(u, {
        headers: { "User-Agent": "AllVapsCatalogBot/1.0 (official packshot mirror; read-only)" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 800) continue;
      buf = Buffer.from(ab);
      break;
    }
    if (!buf) return null;

    await sharp(buf)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(destAbs);
    return destRel;
  } catch {
    return null;
  }
}

async function upsertReferentielJson(mfr: { id: string; slug: string }) {
  // Append e.Tasty to référentiel JSON if missing (source of truth for sync)
  const fabPath = path.resolve("data/referentiel/01_FABRICANTS.json");
  const gamPath = path.resolve("data/referentiel/02_GAMMES.json");
  const fab = JSON.parse(fs.readFileSync(fabPath, "utf8"));
  const gam = JSON.parse(fs.readFileSync(gamPath, "utf8"));

  if (!fab.items.some((i: any) => i.slug === "e-tasty")) {
    fab.items.push({
      id: "MFR-e_tasty",
      nom: "e.Tasty",
      slug: "e-tasty",
      slugDossier: "E_Tasty",
      site: "https://pro.e-tasty.fr/",
      pays: "France",
      email: null,
      marquesDeclarees: ["e.Tasty"],
      gammesCountMaster: Object.keys(OFFICIAL_RANGE_PAGES).length,
      produitsCountMaster: 0,
      status: "partiel",
      statusSource: "SITE_OFFICIEL_PRO + SUMUP_STOCK",
      dossierLocal: null,
      packshotsLocaux: 0,
      fichesProduitsLocales: 0,
      anomalies: ["hors_master_dossier_complet", "photos_a_associer"],
    });
    fab.total = fab.items.length;
    fab.partiel = (fab.partiel || 0) + 1;
    fab.date = new Date().toISOString();
    fs.writeFileSync(fabPath, JSON.stringify(fab, null, 2), "utf8");
  }

  for (const r of Object.values(OFFICIAL_RANGE_PAGES)) {
    const id = `RNG-e_tasty-${r.slug.replace(/-/g, "_")}`;
    if (gam.items.some((i: any) => i.id === id || (i.slug === r.slug && i.fabricantSlug === "e-tasty"))) {
      continue;
    }
    gam.items.push({
      id,
      nom: r.name,
      slug: r.slug,
      fabricant: "e.Tasty",
      fabricantSlug: "e-tasty",
      description: `Gamme ${r.name} (e.Tasty) — présente en stock SumUp All Vap's`,
      site: `https://pro.e-tasty.fr${r.path}`,
      formatsDeclares: r.formatCodes.join(" / "),
      formatCodes: r.formatCodes,
      formatsStatus: "partiel",
      origine: "France",
      status: "partiel",
      statusSource: "SUMUP_LIBELLE + SITE_OFFICIEL",
      anomalies: ["validation_photo_en_cours"],
    });
  }
  gam.total = gam.items.length;
  gam.date = new Date().toISOString();
  fs.writeFileSync(gamPath, JSON.stringify(gam, null, 2), "utf8");
  void mfr;
}

async function main() {
  console.log("=== Intégration e.Tasty ===\n");
  const official = loadOfficialCatalog();
  console.log(`Catalogue officiel scrapé (chemins validés) : ${official.length} refs`);

  // 1) Manufacturer + Brand
  const manufacturer = await prisma.manufacturer.upsert({
    where: { slug: "e-tasty" },
    create: {
      masterId: "MFR-e_tasty",
      name: "e.Tasty",
      slug: "e-tasty",
      website: "https://pro.e-tasty.fr/",
      country: "France",
      status: "partiel",
      sortOrder: 50,
      isActive: true,
    },
    update: {
      masterId: "MFR-e_tasty",
      name: "e.Tasty",
      website: "https://pro.e-tasty.fr/",
      country: "France",
      status: "partiel",
      isActive: true,
    },
  });

  const brand = await prisma.brand.upsert({
    where: { slug: "e-tasty" },
    create: {
      name: "e.Tasty",
      slug: "e-tasty",
      manufacturerId: manufacturer.id,
      masterId: "BRD-mfr-e-tasty",
      status: "partiel",
      isActive: true,
    },
    update: {
      name: "e.Tasty",
      manufacturerId: manufacturer.id,
      status: "partiel",
      isActive: true,
    },
  });

  const rangeRows = new Map<string, { id: string; name: string; slug: string; family: string }>();
  let sort = 0;
  for (const [key, meta] of Object.entries(OFFICIAL_RANGE_PAGES)) {
    const row = await prisma.productRange.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: meta.slug } },
      create: {
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        name: meta.name,
        slug: meta.slug,
        masterId: `RNG-e_tasty-${meta.slug.replace(/-/g, "_")}`,
        formatCodes: meta.formatCodes,
        status: "partiel",
        sortOrder: sort++,
        isActive: true,
      },
      update: {
        manufacturerId: manufacturer.id,
        name: meta.name,
        formatCodes: meta.formatCodes,
        status: "partiel",
        isActive: true,
        masterId: `RNG-e_tasty-${meta.slug.replace(/-/g, "_")}`,
      },
    });
    rangeRows.set(key, { id: row.id, name: meta.name, slug: meta.slug, family: meta.family });
  }

  await upsertReferentielJson(manufacturer);

  // 2) Collect SumUp e.Tasty products
  const all = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "e-tasty", mode: "insensitive" } },
        { name: { contains: "E-Tasty", mode: "insensitive" } },
        { name: { contains: "E Tasty", mode: "insensitive" } },
        { name: { contains: "ETasty", mode: "insensitive" } },
        { name: { contains: "etasty", mode: "insensitive" } },
        { sumupName: { contains: "tasty", mode: "insensitive" } },
      ],
    },
    include: { variants: true, catalogImages: true },
    orderBy: { name: "asc" },
  });

  const products = all.filter((p) => isETasty(p.name) || isETasty(p.sumupName || ""));

  const report = {
    date: new Date().toISOString(),
    fabricant: "e.Tasty",
    manufacturerSlug: "e-tasty",
    officialRefsLoaded: official.length,
    totalSumUp: products.length,
    diySkipped: 0,
    linkedByExplicitRange: 0,
    linkedByOneTasteFlavorMatch: 0,
    leftAVerifierNoRange: 0,
    photosAssociated: 0,
    photosMissing: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    published: [] as string[],
    aVerifier: [] as Array<{ name: string; reason: string }>,
    gammes: {} as Record<
      string,
      { linked: number; published: number; formats: string[]; sample: string[] }
    >,
    controlUrls: {
      fabricant: "http://localhost:3000/fabricants/e-tasty",
      gammes: Object.values(OFFICIAL_RANGE_PAGES).map(
        (r) => `http://localhost:3000/gammes/${r.slug}?fabricant=e-tasty`
      ),
    },
  };

  for (const key of Object.keys(OFFICIAL_RANGE_PAGES)) {
    report.gammes[key] = { linked: 0, published: 0, formats: [], sample: [] };
  }

  for (const p of products) {
    if (isDiyBase(p.name, p.category)) {
      report.diySkipped++;
      report.aVerifier.push({ name: p.name, reason: "diy_base_hors_gammes_e_liquides" });
      await prisma.product.update({
        where: { id: p.id },
        data: {
          manufacturerId: manufacturer.id,
          brandId: brand.id,
          brand: "e.Tasty",
          catalogStatus: "a_verifier",
          visibleOnline: false,
          productFamily: "ETASTY_DIY",
          importAnomaly: "diy_base_a_verifier",
        },
      });
      continue;
    }

    let format = detectFormat(p.name, p.category);
    const nic = detectNicotine(p.name);
    let rangeKey = detectExplicitRange(p.name);
    let matchSource: "explicit" | "one_taste_flavor" | null = rangeKey ? "explicit" : null;
    let officialHit: OfficialProduct | null = null;

    if (!rangeKey) {
      // Tentative One Taste 10ml / 50ml via saveur officielle uniquement
      const flavorHint = extractFlavorHint(p.name);
      const hit10 = matchOfficial(official, "one-taste", flavorHint, format || "10ml");
      if (hit10 && (format === "10ml" || format === "50ml")) {
        rangeKey = "one-taste";
        matchSource = "one_taste_flavor";
        officialHit = hit10;
      }
    }

    if (!rangeKey) {
      report.leftAVerifierNoRange++;
      report.aVerifier.push({ name: p.name, reason: "gamme_non_declarable" });
      await prisma.product.update({
        where: { id: p.id },
        data: {
          manufacturerId: manufacturer.id,
          brandId: brand.id,
          brand: "e.Tasty",
          catalogStatus: "a_verifier",
          visibleOnline: false,
          productFamily: "ETASTY_A_VERIFIER",
          productType: format,
          importAnomaly: "gamme_non_declarable",
          rangeId: null,
          range: null,
        },
      });
      continue;
    }

    const rangeMeta = rangeRows.get(rangeKey)!;
    if (matchSource === "explicit") report.linkedByExplicitRange++;
    if (matchSource === "one_taste_flavor") report.linkedByOneTasteFlavorMatch++;

    if (!officialHit) {
      officialHit = matchOfficial(
        official,
        rangeKey,
        extractFlavorHint(p.name),
        format
      );
    }

    // Format confirmé par fiche officielle si SumUp ne le déclare pas
    if (!format && officialHit?.format) {
      format = officialHit.format;
    }

    let imageUrl = p.imageUrl;
    let imageStatus = p.imageStatus;
    if (officialHit?.imageUrl) {
      const local = await downloadOfficialImage(
        officialHit.imageUrl,
        rangeMeta.slug,
        format,
        slugify(p.slug || p.name)
      );
      if (local) {
        imageUrl = local;
        imageStatus = "official";
        report.photosAssociated++;
        const existingImg = p.catalogImages.find((i) => i.url === local);
        if (!existingImg) {
          await prisma.productImage.create({
            data: {
              productId: p.id,
              url: local,
              status: "official",
              sortOrder: 0,
              alt: `${rangeMeta.name} — ${extractFlavorHint(p.name)}`,
            },
          });
        }
      } else {
        report.photosMissing++;
      }
    } else {
      report.photosMissing++;
    }

    const g = report.gammes[rangeKey];
    g.linked++;
    if (format && !g.formats.includes(format)) g.formats.push(format);
    if (g.sample.length < 5) g.sample.push(p.name);

    // Variante nicotine / format
    const capacityMl = format ? parseFloat(format) : null;
    if (!p.variants[0]) {
      await prisma.productVariant.create({
        data: {
          productId: p.id,
          name: nic.label ? `${format || ""} ${nic.label}`.trim() : format || p.name,
          capacityMl,
          nicotineMg: nic.mg,
          nicotineLabel: nic.label,
          sumupVariantId: p.sumupVariantId,
          barcode: p.barcode,
          active: true,
        },
      });
      report.variantsCreated++;
    } else {
      await prisma.productVariant.update({
        where: { id: p.variants[0].id },
        data: {
          capacityMl: capacityMl ?? p.variants[0].capacityMl,
          nicotineMg: nic.mg ?? p.variants[0].nicotineMg,
          nicotineLabel: nic.label ?? p.variants[0].nicotineLabel,
          sumupVariantId: p.sumupVariantId || p.variants[0].sumupVariantId,
          barcode: p.barcode || p.variants[0].barcode,
          active: true,
        },
      });
      report.variantsUpdated++;
    }

    const canPublish =
      imageStatus === "official" &&
      !!imageUrl?.startsWith("/media/") &&
      !!format &&
      !!p.priceCents &&
      p.priceCents > 0 &&
      !!p.sumupProductId &&
      matchSource === "explicit"; // ne publie pas les matches flavor One Taste implicites

    const fileOk =
      canPublish && imageUrl
        ? fs.existsSync(path.resolve("public", imageUrl.replace(/^\//, "")))
        : false;

    const publish = Boolean(canPublish && fileOk);

    await prisma.product.update({
      where: { id: p.id },
      data: {
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        brand: "e.Tasty",
        rangeId: rangeMeta.id,
        range: rangeMeta.name,
        productFamily: rangeMeta.family,
        productType: format,
        catalogStatus: publish ? "valide" : "a_verifier",
        visibleOnline: publish,
        isActive: true,
        imageUrl: imageUrl || p.imageUrl,
        imageStatus: imageStatus || p.imageStatus,
        importAnomaly: publish
          ? null
          : [
              !format ? "format_manquant" : null,
              imageStatus !== "official" ? "photo_officielle_manquante" : null,
              !p.priceCents ? "prix_manquant" : null,
              !p.sumupProductId ? "sumup_manquant" : null,
              matchSource === "one_taste_flavor" ? "gamme_one_taste_par_match_saveur" : null,
            ]
              .filter(Boolean)
              .join("|") || "a_verifier",
      },
    });

    if (publish) {
      report.published.push(p.name);
      g.published++;
    } else {
      report.aVerifier.push({
        name: p.name,
        reason:
          matchSource === "one_taste_flavor"
            ? "one_taste_match_saveur_non_publie"
            : imageStatus !== "official"
              ? "photo"
              : !format
                ? "format"
                : !p.priceCents
                  ? "prix"
                  : !p.sumupProductId
                    ? "sumup"
                    : "a_verifier",
      });
    }

    await new Promise((r) => setTimeout(r, 40));
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  const md = `# Rapport intégration e.Tasty

Date : ${report.date}

## Fabricant
- **e.Tasty** (\`/fabricants/e-tasty\`) — statut référentiel : **partiel**
- Site officiel : https://pro.e-tasty.fr/

## Gammes intégrées (présentes dans SumUp + confirmées site officiel)

| Gamme | Liés | Publiés | Formats |
|-------|------|---------|---------|
${Object.entries(report.gammes)
  .map(
    ([k, g]) =>
      `| ${OFFICIAL_RANGE_PAGES[k].name} | ${g.linked} | ${g.published} | ${g.formats.join(", ") || "—"} |`
  )
  .join("\n")}

## Volumes
- Références SumUp e.Tasty : **${report.totalSumUp}**
- Liés gamme explicite : **${report.linkedByExplicitRange}**
- Liés One Taste par match saveur officielle (non publiés) : **${report.linkedByOneTasteFlavorMatch}**
- Sans gamme déclarable (À vérifier) : **${report.leftAVerifierNoRange}**
- DIY bases (hors gammes e-liquides) : **${report.diySkipped}**
- Photos officielles associées : **${report.photosAssociated}**
- Photos manquantes : **${report.photosMissing}**
- Variantes créées : **${report.variantsCreated}**
- Variantes mises à jour : **${report.variantsUpdated}**
- Produits publiés en ligne : **${report.published.length}**

## Règles respectées
- Aucune donnée inventée
- Pas d’écriture SumUp
- Pas de mélange fabricants / gammes
- Publication uniquement si : gamme explicite + photo officielle locale + format + prix SumUp + ID SumUp
- Sinon : \`catalogStatus=a_verifier\`, \`visibleOnline=false\`

## URLs de contrôle
- Fabricant : ${report.controlUrls.fabricant}
${report.controlUrls.gammes.map((u) => `- ${u}`).join("\n")}
`;
  fs.writeFileSync(REPORT_MD, md, "utf8");
  console.log(JSON.stringify({
    published: report.published.length,
    linkedExplicit: report.linkedByExplicitRange,
    linkedOneTaste: report.linkedByOneTasteFlavorMatch,
    noRange: report.leftAVerifierNoRange,
    photos: report.photosAssociated,
    variantsCreated: report.variantsCreated,
    gammes: Object.fromEntries(
      Object.entries(report.gammes).map(([k, g]) => [k, { linked: g.linked, published: g.published }])
    ),
    report: REPORT_MD,
  }, null, 2));
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(async () => {
    await prisma.$disconnect();
  });
