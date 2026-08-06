/**
 * Rebuild complet catalogue e.Tasty.
 *
 * Croise :
 * 1) données déjà en DB + médias ZIP déjà importés (public/media/products/e-tasty)
 * 2) lignes SumUp locales (read-only)
 * 3) site officiel https://pro.e-tasty.fr
 *
 * - Aucune écriture SumUp
 * - Aucune invention de produit
 * - Ne mélange jamais concentrés 30 ml et e-liquides 100 ml
 * - Catégories / formats corrigés automatiquement
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const OUT_JSON = path.resolve("data/rebuild/RAPPORT_ETASTY_REBUILD.json");
const OUT_MD = path.resolve("data/rebuild/RAPPORT_ETASTY_REBUILD.md");
const SCRAPE_OUT = path.resolve("data/rebuild/ETASTY_OFFICIAL_SCRAPE_FULL.json");
const MEDIA_ROOT = path.resolve("public/media/products/e-tasty");
const FORCE_REFRESH = process.argv.includes("--refresh");

type OfficialProduct = {
  title: string;
  imageUrl: string | null;
  productUrl: string | null;
  rangeSlug: string;
  rangeName: string;
  formatMl: number | null;
  isConcentrate: boolean;
  ean: string | null;
};

type OfficialRange = {
  path: string;
  slug: string;
  name: string;
  status: number;
  products: OfficialProduct[];
};

const RANGE_DEFS: Array<{ path: string; slug: string; name: string }> = [
  { path: "/15_one-taste", slug: "one-taste", name: "One Taste" },
  { path: "/44_bankiz", slug: "bankiz", name: "Bankiz" },
  { path: "/33_inspiration", slug: "inspiration", name: "Inspiration" },
  { path: "/92_godfall-city", slug: "god-fall-city", name: "God Fall City" },
  { path: "/4_smokewars", slug: "smoke-wars", name: "Smoke Wars" },
  { path: "/78_gang-organise", slug: "gang-organise", name: "Gang Organisé" },
  { path: "/16_freezy-crush", slug: "freezy-crush", name: "Freezy Crush" },
  { path: "/51_numbers", slug: "numbers", name: "Numbers" },
  { path: "/90_letters", slug: "letters", name: "Letters" },
  { path: "/91_twenty", slug: "twenty", name: "Twenty" },
  { path: "/5_amazone", slug: "amazone", name: "Amazone" },
  { path: "/54_shootiz", slug: "shootiz", name: "Shootiz" },
  { path: "/63_la-cueillette-de-louise", slug: "la-cueillette-de-louise", name: "La Cueillette de Louise" },
  { path: "/67_amalgam", slug: "amalgam", name: "Amalgam" },
  { path: "/26_call-me-biggy", slug: "call-me-biggy", name: "Call Me Biggy" },
  { path: "/28_deep-seas", slug: "deep-seas", name: "Deep Seas" },
  { path: "/3_gameover", slug: "gameover", name: "Gameover" },
  { path: "/23_loly-yumy", slug: "loly-yumy", name: "Loly Yumy" },
  { path: "/7_sept", slug: "sept", name: "Sept" },
  { path: "/2_summer-spicy", slug: "summer-spicy", name: "Summer Spicy" },
  { path: "/24_windy-juice", slug: "windy-juice", name: "Windy Juice" },
  { path: "/76_easy", slug: "easy", name: "Easy" },
  { path: "/87_les-maxis-malins", slug: "les-maxis-malins", name: "Les Maxis Malins" },
  { path: "/55_do-it-yourself", slug: "do-it-yourself", name: "Do It Yourself" },
];

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectFormatMl(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*ml\b/i);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Numbers / Letters existent en 30 ml (concentré) ET 100 ml (flacon e-liquide).
 * Ne jamais les confondre.
 */
function detectProductKind(
  text: string,
  formatMl: number | null
): "e-liquide" | "concentre" | "booster" | "base" | "autre" {
  const t = text.toLowerCase();
  if (/\bbase\b/.test(t) && /pg|vg|diy/.test(t)) return "base";
  if (/booster|nicotine\s*booster/i.test(t)) return "booster";

  const isNumbersLettersShootiz = /numbers\d*|letters|shootiz/i.test(t);
  if (isNumbersLettersShootiz) {
    if (/concentr[ée]/i.test(t) || formatMl === 30) return "concentre";
    if (formatMl === 100) return "e-liquide";
    // défaut SumUp : "Concentré NumbersX 30ml"
    if (/concentr/i.test(t)) return "concentre";
    return formatMl && formatMl <= 30 ? "concentre" : "e-liquide";
  }

  if (/concentr[ée]|ar[oô]me\b/.test(t)) return "concentre";
  if (/\b\d+\s*ml\b/.test(t) || /e-?liquide|flacon|one taste|bankiz|twenty|god\s*fall/i.test(t)) {
    return "e-liquide";
  }
  return "autre";
}

function detectRangeFromText(text: string): { slug: string; name: string } | null {
  const rules: Array<[RegExp, string, string]> = [
    [/one\s*taste/i, "one-taste", "One Taste"],
    [/bankiz/i, "bankiz", "Bankiz"],
    [/inspiration/i, "inspiration", "Inspiration"],
    [/god\s*fall\s*city|godfall/i, "god-fall-city", "God Fall City"],
    [/smoke\s*wars|smokewars/i, "smoke-wars", "Smoke Wars"],
    [/gang\s*organis/i, "gang-organise", "Gang Organisé"],
    [/freezy\s*crush/i, "freezy-crush", "Freezy Crush"],
    [/numbers\d*/i, "numbers", "Numbers"],
    [/letters/i, "letters", "Letters"],
    [/\btwenty\b/i, "twenty", "Twenty"],
    [/\bamazone\b|huallaga|maroni|orinoco|yapura|\byosh\b/i, "amazone", "Amazone"],
    [/shootiz/i, "shootiz", "Shootiz"],
    [/cueillette\s*de\s*louise/i, "la-cueillette-de-louise", "La Cueillette de Louise"],
    [/amalgam/i, "amalgam", "Amalgam"],
    [/call\s*me\s*biggy/i, "call-me-biggy", "Call Me Biggy"],
    [/deep\s*seas/i, "deep-seas", "Deep Seas"],
    [/game\s*over|gameover/i, "gameover", "Gameover"],
    [/loly\s*yumy/i, "loly-yumy", "Loly Yumy"],
    [/\bsept\b/i, "sept", "Sept"],
    [/summer\s*spicy/i, "summer-spicy", "Summer Spicy"],
    [/windy\s*juice/i, "windy-juice", "Windy Juice"],
    [/\beasy\b/i, "easy", "Easy"],
    [/maxis\s*malins/i, "les-maxis-malins", "Les Maxis Malins"],
    [/\bbase\b.*\b(pg|vg)\b|\bpack\s*base\b|do\s*it\s*yourself|\bdiy\b/i, "do-it-yourself", "Do It Yourself"],
  ];
  for (const [re, slug, name] of rules) {
    if (re.test(text)) return { slug, name };
  }
  return null;
}

function softNorm(s: string): string {
  return norm(s)
    .replace(/ee/g, "e")
    .replace(/eau/g, "o")
    .replace(/ph/g, "f")
    .replace(/([a-z])\1+/g, "$1"); // lettres doubles
}

function categoryFor(kind: string, formatMl: number | null): string {
  if (kind === "concentre") return formatMl ? `Concentrés ${formatMl} ml` : "Concentrés";
  if (kind === "base") return "DIY Bases";
  if (kind === "booster") return "Boosters";
  if (formatMl) return `E-liquides ${formatMl} ml`;
  return "E-liquides";
}

function productTypeCode(kind: string, formatMl: number | null): string | null {
  if (!formatMl) return null;
  if (kind === "concentre") return `concentre-${formatMl}ml`;
  return `${formatMl}ml`;
}

function extractNumbersId(text: string): number | null {
  const m = text.match(/numbers\s*0*(\d{1,2})\b/i) || text.match(/numbers(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

function extractLetterId(text: string): string | null {
  // Toujours prendre la lettre SumUp (évite pollution "LETTERS A" dans name corrigé à tort)
  const m =
    text.match(/letters?\s*([abc])\b/i) ||
    text.match(/\bletter\s*([abc])\b/i) ||
    text.match(/\b([abc])\s*concentr/i);
  return m ? m[1].toUpperCase() : null;
}

function rangeFromExisting(rangeName: string | null | undefined): { slug: string; name: string } | null {
  if (!rangeName) return null;
  return detectRangeFromText(rangeName) || detectRangeFromText(rangeName.replace(/-/g, " "));
}

function rangeFromFamily(family: string | null | undefined): { slug: string; name: string } | null {
  if (!family || !family.startsWith("ETASTY_")) return null;
  const slug = family.replace(/^ETASTY_/, "").toLowerCase().replace(/_/g, "-");
  if (slug === "unknown") return null;
  const def = RANGE_DEFS.find((d) => d.slug === slug);
  if (def) return { slug: def.slug, name: def.name };
  return detectRangeFromText(slug.replace(/-/g, " "));
}

function inferOneTasteFromOfficial(
  sumupName: string,
  formatMl: number | null,
  officialAll: OfficialProduct[]
): OfficialProduct | null {
  if (formatMl !== 10 && formatMl !== 50) return null;
  const flavor = softNorm(
    sumupName
      .replace(/e[-\s]?tasty|etasty/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " ")
      .replace(/sels?\s*de\s*nicotine|sel\s*de\s*nicotine|nicotine/gi, " ")
  );
  const tokens = flavor.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return null;
  const candidates = officialAll.filter(
    (p) => p.rangeSlug === "one-taste" && !p.isConcentrate && (!formatMl || p.formatMl === formatMl)
  );
  const scored = candidates
    .map((p) => {
      const title = softNorm(p.title).replace(/one taste/g, " ");
      let score = tokens.filter((t) => title.includes(t)).length;
      // match approximatif token↔mot (citron givree / citron givre)
      if (score === 0) {
        const words = title.split(/\s+/).filter((w) => w.length > 2);
        score = tokens.filter((t) =>
          words.some((w) => w.startsWith(t.slice(0, 4)) || t.startsWith(w.slice(0, 4)))
        ).length;
      }
      return { p, score };
    })
    .filter((x) => x.score >= Math.min(1, tokens.length) && (tokens.length === 1 ? x.score >= 1 : x.score >= 1))
    .sort((a, b) => b.score - a.score);
  // Exiger un score plus strict si multi-tokens
  const best = scored[0];
  if (!best) return null;
  if (tokens.length >= 2 && best.score < 1) return null;
  return best.p;
}

async function fetchHtml(urlPath: string) {
  const url = urlPath.startsWith("http") ? urlPath : `https://pro.e-tasty.fr${urlPath}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0 (rebuild verification; read-only)" },
    redirect: "follow",
    signal: AbortSignal.timeout(45000),
  });
  return { status: res.status, html: await res.text(), url: res.url };
}

function extractProducts(html: string) {
  const products: Array<{
    title: string;
    imageUrl: string | null;
    productUrl: string | null;
    ean: string | null;
  }> = [];
  const blocks = [...html.matchAll(/<article[^>]*class="[^"]*product-miniature[^"]*"[\s\S]*?<\/article>/gi)];
  for (const block of blocks) {
    const chunk = block[0];
    const title =
      chunk.match(/itemprop="name"[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      chunk.match(/title="([^"]+)"/i)?.[1]?.trim() ||
      chunk.match(/alt="([^"]+)"/i)?.[1]?.trim() ||
      null;
    const imageUrl =
      chunk.match(/data-full-size-image-url="([^"]+)"/i)?.[1] ||
      chunk.match(/data-src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1] ||
      null;
    const productUrl =
      chunk.match(/href="(https:\/\/pro\.e-tasty\.fr\/[^"#]+)/i)?.[1] ||
      chunk.match(/href="(\/\d+-[^"#]+\.html)/i)?.[1] ||
      null;
    const ean =
      productUrl?.match(/(37\d{11})/)?.[1] ||
      chunk.match(/(37\d{11})/)?.[1] ||
      null;
    if (title) {
      products.push({
        title: title.replace(/\s+/g, " ").trim(),
        imageUrl: imageUrl
          ? imageUrl.replace("https:/", "https://").replace(/([^:])\/\//g, "$1/")
          : null,
        productUrl: productUrl
          ? productUrl.startsWith("http")
            ? productUrl
            : `https://pro.e-tasty.fr${productUrl}`
          : null,
        ean,
      });
    }
  }
  return products;
}

function officialIsConcentrate(title: string, productUrl: string | null): boolean {
  if (/\/les-concentres\//i.test(productUrl || "")) return true;
  if (/concentr[ée]/i.test(title)) return true;
  return false;
}

async function scrapeOfficial(): Promise<OfficialRange[]> {
  const ranges: OfficialRange[] = [];
  for (const def of RANGE_DEFS) {
    try {
      const page = await fetchHtml(def.path);
      const raw = page.status === 200 ? extractProducts(page.html) : [];
      const products: OfficialProduct[] = raw.map((p) => {
        const formatMl = detectFormatMl(`${p.title} ${p.productUrl || ""}`);
        const isConcentrate = officialIsConcentrate(p.title, p.productUrl);
        return {
          ...p,
          rangeSlug: def.slug,
          rangeName: def.name,
          formatMl,
          isConcentrate,
          ean: p.ean,
        };
      });
      ranges.push({
        path: def.path,
        slug: def.slug,
        name: def.name,
        status: page.status,
        products,
      });
      console.log(`SCRAPE ${def.slug}: ${page.status} products=${products.length}`);
    } catch (e) {
      console.warn(`SCRAPE_FAIL ${def.slug}`, e);
      ranges.push({ path: def.path, slug: def.slug, name: def.name, status: 0, products: [] });
    }
  }
  return ranges;
}

function loadOrScrapeOfficial(): Promise<OfficialRange[]> {
  if (!FORCE_REFRESH && fs.existsSync(SCRAPE_OUT)) {
    const raw = JSON.parse(fs.readFileSync(SCRAPE_OUT, "utf8"));
    console.log(`Reuse scrape ${SCRAPE_OUT}`);
    return Promise.resolve(raw.ranges as OfficialRange[]);
  }
  return scrapeOfficial().then((ranges) => {
    fs.mkdirSync(path.dirname(SCRAPE_OUT), { recursive: true });
    fs.writeFileSync(
      SCRAPE_OUT,
      JSON.stringify({ date: new Date().toISOString(), ranges }, null, 2),
      "utf8"
    );
    return ranges;
  });
}

function inventoryZipMedia(): string[] {
  if (!fs.existsSync(MEDIA_ROOT)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else out.push(path.relative(MEDIA_ROOT, full).replace(/\\/g, "/"));
    }
  };
  walk(MEDIA_ROOT);
  return out;
}

function matchOfficial(
  sourceText: string,
  rangeSlug: string | null,
  formatMl: number | null,
  kind: string,
  all: OfficialProduct[]
): OfficialProduct | null {
  if (!rangeSlug) return null;
  const candidates = all.filter((p) => p.rangeSlug === rangeSlug);
  if (!candidates.length) return null;

  // Numbers N exact
  if (rangeSlug === "numbers") {
    const n = extractNumbersId(sourceText);
    if (n != null) {
      const wantConc = kind === "concentre";
      const hit = candidates.find((p) => {
        const pn = extractNumbersId(p.title);
        if (pn !== n) return false;
        if (formatMl && p.formatMl && p.formatMl !== formatMl) return false;
        if (wantConc !== p.isConcentrate) return false;
        return true;
      });
      if (hit) return hit;
      return (
        candidates.find(
          (p) =>
            extractNumbersId(p.title) === n &&
            (!formatMl || !p.formatMl || p.formatMl === formatMl)
        ) || null
      );
    }
  }

  // Letters A/B/C exact
  if (rangeSlug === "letters") {
    const letter = extractLetterId(sourceText);
    if (letter) {
      const wantConc = kind === "concentre";
      const hit = candidates.find((p) => {
        const pl = extractLetterId(p.title);
        if (pl !== letter) return false;
        if (formatMl && p.formatMl && p.formatMl !== formatMl) return false;
        if (wantConc !== p.isConcentrate) return false;
        return true;
      });
      if (hit) return hit;
    }
  }

  // Generic flavor token match (same format + same concentrate flag)
  const flavor = norm(
    sourceText
      .replace(/e[-\s]?tasty|etasty/gi, " ")
      .replace(
        /one\s*taste|bankiz|inspiration|god\s*fall(?:\s*city)?|smoke\s*wars|gang\s*organis[ée]?|freezy\s*crush|numbers\d*|letters?|twenty|amazone|shootiz|cueillette(?:\s*de\s*louise)?|amalgam|call\s*me\s*biggy|deep\s*seas|gameover|loly\s*yumy|summer\s*spicy|windy\s*juice|maxis\s*malins|concentr[ée]s?|e-?liquide/gi,
        " "
      )
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " ")
  );
  const tokens = flavor.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return null;

  const scored = candidates
    .map((p) => {
      const title = norm(p.title);
      const score = tokens.filter((t) => title.includes(t)).length;
      const formatOk = !formatMl || !p.formatMl || p.formatMl === formatMl;
      const kindOk =
        kind === "concentre" ? p.isConcentrate : kind === "e-liquide" ? !p.isConcentrate : true;
      return { p, score, formatOk, kindOk };
    })
    .filter((x) => x.score >= Math.min(2, tokens.length) && x.formatOk && x.kindOk)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.p || null;
}

function buildDisplayName(
  sourceText: string,
  official: OfficialProduct | null,
  range: { slug: string; name: string } | null,
  kind: string,
  formatMl: number | null
): string {
  if (official?.title) {
    return official.title.replace(/\s+/g, " ").trim();
  }
  if (range?.slug === "numbers") {
    const n = extractNumbersId(sourceText);
    if (n != null && formatMl) {
      const label = String(n).padStart(2, "0");
      return kind === "concentre"
        ? `Numbers ${label} — Concentré ${formatMl} ml`
        : `Numbers ${label} — ${formatMl} ml`;
    }
  }
  if (range?.slug === "letters") {
    const letter = extractLetterId(sourceText);
    if (letter && formatMl) {
      return kind === "concentre"
        ? `LETTERS ${letter} CONCENTRÉ ${formatMl}ml`
        : `LETTERS ${letter} — ${formatMl} ml`;
    }
  }
  return sourceText.replace(/\s+/g, " ").trim().slice(0, 180);
}

async function ensureManufacturerAndRanges(officialRanges: OfficialRange[]) {
  let manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "e-tasty" } });
  if (!manufacturer) {
    manufacturer = await prisma.manufacturer.create({
      data: {
        masterId: "MFR-e_tasty",
        name: "e.Tasty",
        slug: "e-tasty",
        website: "https://pro.e-tasty.fr/",
        country: "France",
        status: "partiel",
        isActive: true,
      },
    });
  }

  let brand = await prisma.brand.findFirst({
    where: { OR: [{ slug: "e-tasty" }, { name: { equals: "e.Tasty", mode: "insensitive" } }] },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "e.Tasty",
        slug: "e-tasty",
        manufacturerId: manufacturer.id,
        masterId: "BRD-e_tasty",
        status: "partiel",
        isActive: true,
      },
    });
  } else {
    brand = await prisma.brand.update({
      where: { id: brand.id },
      data: { manufacturerId: manufacturer.id, isActive: true },
    });
  }

  const rangeMap = new Map<string, string>();
  for (const r of officialRanges) {
    const formats = [
      ...new Set(
        r.products
          .map((p) =>
            p.formatMl ? `${p.isConcentrate ? "concentre-" : ""}${p.formatMl}ml` : null
          )
          .filter(Boolean) as string[]
      ),
    ];
    let range = await prisma.productRange.findFirst({
      where: { slug: r.slug, brandId: brand.id },
    });
    if (!range) {
      range = await prisma.productRange.create({
        data: {
          name: r.name,
          slug: r.slug,
          brandId: brand.id,
          manufacturerId: manufacturer.id,
          masterId: `RNG-e_tasty-${r.slug.replace(/-/g, "_")}`,
          formatCodes: formats.length ? formats : ["50ml"],
          status: r.products.length ? "partiel" : "a_verifier",
          isActive: true,
        },
      });
    } else {
      range = await prisma.productRange.update({
        where: { id: range.id },
        data: {
          name: r.name,
          manufacturerId: manufacturer.id,
          formatCodes: formats.length ? formats : range.formatCodes,
          isActive: true,
          status: r.products.length ? "partiel" : range.status,
        },
      });
    }
    rangeMap.set(r.slug, range.id);
  }

  for (const code of ["10ml", "20ml", "30ml", "50ml", "100ml", "170ml", "concentre-30ml"]) {
    const existing = await prisma.catalogFormat.findUnique({ where: { code } });
    if (!existing) {
      await prisma.catalogFormat.create({
        data: {
          code,
          label: code.startsWith("concentre-")
            ? `Concentré ${code.replace("concentre-", "")}`
            : code.replace("ml", " ml"),
        },
      });
    }
  }

  return { manufacturer, brand, rangeMap };
}

async function main() {
  console.log("=== SOURCES ===");
  const zipMedia = inventoryZipMedia();
  console.log(`ZIP/media locaux: ${zipMedia.length} fichiers sous public/media/products/e-tasty`);

  console.log("=== SCRAPE OFFICIEL ===");
  const officialRanges = await loadOrScrapeOfficial();
  // Re-normalize concentrate flags from URL (in case old scrape)
  for (const r of officialRanges) {
    for (const p of r.products) {
      p.isConcentrate = officialIsConcentrate(p.title, p.productUrl);
      if (!p.formatMl) p.formatMl = detectFormatMl(`${p.title} ${p.productUrl || ""}`);
    }
  }
  const officialAll = officialRanges.flatMap((r) => r.products);

  const { manufacturer, rangeMap } = await ensureManufacturerAndRanges(officialRanges);

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { brand: { contains: "tasty", mode: "insensitive" } },
        { sumupName: { contains: "tasty", mode: "insensitive" } },
        { name: { contains: "tasty", mode: "insensitive" } },
        { productFamily: { startsWith: "ETASTY" } },
        { manufacturerId: manufacturer.id },
      ],
    },
  });

  const report = {
    date: new Date().toISOString(),
    sources: {
      sumupDbRows: products.length,
      zipMediaFiles: zipMedia.length,
      zipMediaRanges: [...new Set(zipMedia.map((f) => f.split("/")[0]))],
      officialRanges: officialRanges.map((r) => ({
        slug: r.slug,
        status: r.status,
        products: r.products.length,
        concentrates: r.products.filter((p) => p.isConcentrate).length,
        readyToVape: r.products.filter((p) => !p.isConcentrate).length,
      })),
      officialProductCount: officialAll.length,
    },
    corrected: [] as Array<Record<string, unknown>>,
    moved: [] as Array<Record<string, unknown>>,
    duplicatesRemoved: [] as Array<Record<string, unknown>>,
    officialOnlyAbsentFromSumup: [] as Array<Record<string, unknown>>,
    sumupOnlyMissingOfficial: [] as Array<Record<string, unknown>>,
    kindStats: {} as Record<string, number>,
    formatStats: {} as Record<string, number>,
    rangeStats: {} as Record<string, number>,
  };

  // Déduplication SumUp ID
  const bySumup = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.sumupProductId || `no-sumup:${p.id}`;
    const list = bySumup.get(key) || [];
    list.push(p);
    bySumup.set(key, list);
  }

  for (const [sumupId, list] of bySumup) {
    if (sumupId.startsWith("no-sumup:") || list.length <= 1) continue;
    const ranked = [...list].sort((a, b) => {
      const score = (x: (typeof list)[0]) =>
        (x.imageUrl ? 2 : 0) +
        (x.visibleOnline ? 1 : 0) +
        (x.isActive ? 1 : 0) +
        (x.priceCents > 0 ? 1 : 0) +
        (x.rangeId ? 1 : 0);
      return score(b) - score(a);
    });
    const keep = ranked[0];
    for (const dup of ranked.slice(1)) {
      await prisma.product.update({
        where: { id: dup.id },
        data: {
          visibleOnline: false,
          isActive: false,
          catalogStatus: "a_verifier",
          importAnomaly: `doublon_sumup_of:${keep.id}`,
        },
      });
      report.duplicatesRemoved.push({
        removedId: dup.id,
        removedName: dup.name,
        keptId: keep.id,
        keptName: keep.name,
        sumupProductId: sumupId,
      });
    }
  }

  // Tous les produits e.Tasty (actifs + inactifs). Filtre doublons en JS
  // (Prisma NOT startsWith exclut les NULL).
  const allRowsRaw = await prisma.product.findMany({
    where: {
      OR: [
        { brand: { contains: "tasty", mode: "insensitive" } },
        { sumupName: { contains: "tasty", mode: "insensitive" } },
        { name: { contains: "tasty", mode: "insensitive" } },
        { productFamily: { startsWith: "ETASTY" } },
        { manufacturerId: manufacturer.id },
      ],
    },
  });
  const allRows = allRowsRaw.filter(
    (p) => !p.importAnomaly?.startsWith("doublon_sumup_of:")
  );
  console.log(`Rows to rebuild: ${allRows.length}/${allRowsRaw.length}`);

  const matchedOfficialKeys = new Set<string>();

  for (const p of allRows) {
    // Identité = SumUp uniquement (évite pollution des noms déjà mal corrigés)
    const sumupText = p.sumupName || p.name || "";
    let formatMl = detectFormatMl(sumupText) ?? p.volumeMl ?? null;
    let range =
      detectRangeFromText(sumupText) ||
      rangeFromExisting(p.range) ||
      rangeFromFamily(p.productFamily);

    // Defaults de gamme connus
    if (range?.slug === "twenty") formatMl = formatMl || 20;
    if (range?.slug === "god-fall-city" && !/concentr/i.test(sumupText)) {
      formatMl = formatMl || 100;
    }
    if (range?.slug === "numbers" || range?.slug === "letters") {
      if (/concentr/i.test(sumupText)) formatMl = formatMl || 30;
    }

    let kind = detectProductKind(sumupText, formatMl);

    // Règle dure anti-mélange
    if (kind === "concentre" && formatMl === 100 && /concentr/i.test(sumupText)) {
      formatMl = 30;
    }
    if (
      (range?.slug === "numbers" || range?.slug === "letters") &&
      kind === "concentre" &&
      (!formatMl || formatMl === 100)
    ) {
      formatMl = 30;
    }

    kind = detectProductKind(sumupText, formatMl);

    let official = matchOfficial(sumupText, range?.slug || null, formatMl, kind, officialAll);

    // One Taste : SumUp souvent sans le mot "One Taste" (ex. "Ananas 10ml … e-tasty")
    if (!official && (!range || range.slug === "one-taste")) {
      official = inferOneTasteFromOfficial(sumupText, formatMl, officialAll);
      if (official) {
        range = { slug: "one-taste", name: "One Taste" };
        kind = "e-liquide";
        if (official.formatMl) formatMl = official.formatMl;
      }
    }

    // Heuristique contrôlée : e-liquide 10/50 ml e.Tasty sans autre gamme = One Taste
    // (convention SumUp All Vap's / médias ZIP one-taste/{10ml,50ml}) — reste a_verifier si pas d'officiel
    if (
      !range &&
      (formatMl === 10 || formatMl === 50) &&
      kind === "e-liquide" &&
      !/base|pack\s*base|starter|booster/i.test(sumupText)
    ) {
      range = { slug: "one-taste", name: "One Taste" };
    }

    // DIY bases
    if (!range && /base|diy/i.test(sumupText)) {
      range = { slug: "do-it-yourself", name: "Do It Yourself" };
      kind = "base";
    }

    if (official) {
      matchedOfficialKeys.add(
        `${official.rangeSlug}|${official.isConcentrate ? "c" : "e"}|${official.formatMl}|${norm(official.title)}`
      );
      if (!range) range = { slug: official.rangeSlug, name: official.rangeName };
      if (official.formatMl) formatMl = official.formatMl;
      kind = official.isConcentrate ? "concentre" : detectProductKind(sumupText, formatMl);
      if (official.isConcentrate) kind = "concentre";
      else if (kind === "autre" || kind === "concentre") kind = "e-liquide";
    }

    // Letters : forcer lettre depuis SumUp seul
    if (range?.slug === "letters") {
      const letter = extractLetterId(sumupText);
      if (letter && formatMl) {
        const wantConc = kind === "concentre" || /concentr/i.test(sumupText);
        const hit = officialAll.find((op) => {
          if (op.rangeSlug !== "letters") return false;
          if (extractLetterId(op.title) !== letter) return false;
          if (op.formatMl !== formatMl) return false;
          return op.isConcentrate === wantConc;
        });
        if (hit) {
          official = hit;
          kind = hit.isConcentrate ? "concentre" : "e-liquide";
        }
      }
    }

    const typeCode = productTypeCode(kind, formatMl);
    const category = categoryFor(kind, formatMl);
    const rangeId = range ? rangeMap.get(range.slug) || null : null;
    const family = range
      ? `ETASTY_${range.slug.replace(/-/g, "_").toUpperCase()}`
      : "ETASTY_UNKNOWN";
    const displayName = buildDisplayName(sumupText, official, range, kind, formatMl);

    const before = {
      range: p.range,
      productType: p.productType,
      volumeMl: p.volumeMl,
      category: p.category,
      name: p.name,
    };
    const after = {
      range: range?.name || null,
      productType: typeCode,
      volumeMl: formatMl,
      category,
      name: displayName,
      kind,
    };

    const moved =
      (before.range || null) !== (after.range || null) ||
      (before.productType || null) !== (after.productType || null) ||
      (before.volumeMl || null) !== (after.volumeMl || null);

    const needsOfficial = !official && !!p.sumupProductId;
    const wasBadMix =
      (p.productType === "100ml" || p.volumeMl === 100) &&
      (kind === "concentre" || /concentr|letters|numbers/i.test(sumupText));

    await prisma.product.update({
      where: { id: p.id },
      data: {
        brand: "e.Tasty",
        manufacturerId: manufacturer.id,
        range: range?.name || null,
        rangeId,
        productType: typeCode,
        volumeMl: formatMl,
        category,
        productFamily: family,
        name: displayName.slice(0, 180),
        catalogStatus: needsOfficial || wasBadMix ? "a_verifier" : p.catalogStatus,
        ...(wasBadMix && kind === "concentre" ? { visibleOnline: false } : {}),
        promotion10mlEligible: formatMl === 10 && kind === "e-liquide",
        importAnomaly: needsOfficial
          ? "sumup_sans_match_officiel"
          : p.importAnomaly?.startsWith("doublon_")
            ? p.importAnomaly
            : wasBadMix
              ? null
              : p.importAnomaly === "sumup_sans_match_officiel"
                ? null
                : p.importAnomaly,
      },
    });

    report.kindStats[kind] = (report.kindStats[kind] || 0) + 1;
    const fk = typeCode || "unknown";
    report.formatStats[fk] = (report.formatStats[fk] || 0) + 1;
    const rk = range?.name || "sans-gamme";
    report.rangeStats[rk] = (report.rangeStats[rk] || 0) + 1;

    if (moved || before.name !== after.name) {
      report.corrected.push({
        id: p.id,
        sumupName: p.sumupName,
        before,
        after,
        officialTitle: official?.title || null,
        isActive: p.isActive,
      });
    }
    if (moved) {
      report.moved.push({
        id: p.id,
        from: `${before.range || "?"}/${before.productType || "?"}/${before.volumeMl || "?"}`,
        to: `${after.range || "?"}/${after.productType || "?"}/${after.volumeMl || "?"}`,
        name: displayName,
      });
    }
    if (needsOfficial) {
      report.sumupOnlyMissingOfficial.push({
        id: p.id,
        name: displayName,
        sumupName: p.sumupName,
        range: range?.name || null,
        format: typeCode,
        isActive: p.isActive,
      });
    }
  }

  // Officiel présent mais absent de SumUp (toutes gammes scrapées)
  for (const op of officialAll) {
    const key = `${op.rangeSlug}|${op.isConcentrate ? "c" : "e"}|${op.formatMl}|${norm(op.title)}`;
    if (matchedOfficialKeys.has(key)) continue;
    report.officialOnlyAbsentFromSumup.push({
      range: op.rangeName,
      title: op.title,
      formatMl: op.formatMl,
      concentrate: op.isConcentrate,
      url: op.productUrl,
    });
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const md = `# Rapport rebuild e.Tasty

Date : ${report.date}

## Sources croisées
- SumUp (DB locale, lecture seule) : **${report.sources.sumupDbRows}** lignes e.Tasty
- Médias ZIP déjà importés : **${report.sources.zipMediaFiles}** fichiers (\`${report.sources.zipMediaRanges.join(", ")}\`)
- Site officiel pro.e-tasty.fr : **${report.sources.officialProductCount}** produits scrapés

## Gammes officielles scrapées
${report.sources.officialRanges
  .map(
    (r) =>
      `- **${r.slug}** — HTTP ${r.status} — ${r.products} produits (e-liquides ${r.readyToVape} / concentrés ${r.concentrates})`
  )
  .join("\n")}

## Corrections
- Produits corrigés : **${report.corrected.length}**
- Produits déplacés (gamme/format) : **${report.moved.length}**
- Doublons désactivés : **${report.duplicatesRemoved.length}**

## Répartition après rebuild
### Gammes
${Object.entries(report.rangeStats)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Types
${Object.entries(report.kindStats)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

### Formats
${Object.entries(report.formatStats)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Produits déplacés (échantillon)
${report.moved
  .slice(0, 40)
  .map((x) => `- ${(x as any).name}: \`${(x as any).from}\` → \`${(x as any).to}\``)
  .join("\n") || "_aucun_"}

## SumUp sans match officiel (à vérifier manuellement)
${report.sumupOnlyMissingOfficial
  .slice(0, 100)
  .map(
    (x) =>
      `- ${(x as any).sumupName || (x as any).name} — ${(x as any).range || "?"} / ${(x as any).format || "?"}${
        (x as any).isActive === false ? " _(inactif)_" : ""
      }`
  )
  .join("\n") || "_aucun_"}

Total : **${report.sumupOnlyMissingOfficial.length}**

## Officiel e.Tasty absent de SumUp All Vap's
${report.officialOnlyAbsentFromSumup
  .slice(0, 120)
  .map(
    (x) =>
      `- [${(x as any).range}] ${(x as any).title} (${(x as any).formatMl || "?"} ml${
        (x as any).concentrate ? ", concentré" : ""
      })`
  )
  .join("\n") || "_aucun_"}

Total listé : **${report.officialOnlyAbsentFromSumup.length}**

## Règles appliquées
- Numbers / Letters : **30 ml = concentré**, **100 ml = e-liquide** (jamais mélangés)
- God Fall City = e-liquides 100 ml (référence officielle actuelle)
- Twenty = 20 ml
- Catégories auto : \`E-liquides X ml\` / \`Concentrés X ml\`
- Gammes indépendantes (One Taste, Bankiz, Numbers, Letters, Amazone, Shootiz, Cueillette de Louise, …)
- Aucune écriture SumUp / aucune invention de SKU

## Contrôle
- http://localhost:3000/fabricants/e-tasty
- http://localhost:3000/gammes/god-fall-city?fabricant=e-tasty
- http://localhost:3000/gammes/letters?fabricant=e-tasty
- http://localhost:3000/gammes/numbers?fabricant=e-tasty
- http://localhost:3000/gammes/one-taste?fabricant=e-tasty
`;

  fs.writeFileSync(OUT_MD, md, "utf8");
  console.log(
    JSON.stringify(
      {
        corrected: report.corrected.length,
        moved: report.moved.length,
        duplicatesRemoved: report.duplicatesRemoved.length,
        sumupOnly: report.sumupOnlyMissingOfficial.length,
        officialOnly: report.officialOnlyAbsentFromSumup.length,
        kindStats: report.kindStats,
        formatStats: report.formatStats,
        rangeStats: report.rangeStats,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
