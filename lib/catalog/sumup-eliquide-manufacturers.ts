/**
 * Détection fabricants e-liquides depuis CSV SumUp (source de vérité).
 * Aucune invention de marque : match uniquement contre référentiel Yoann + dossiers media existants.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/import/csv";
import { slugify } from "@/lib/utils";

export type KnownManufacturer = {
  name: string;
  slug: string;
  aliases: string[];
};

export type DetectedManufacturer = {
  name: string;
  slug: string;
  productCount: number;
  hasOfficialLogo: boolean;
  status: "LOGO_OK" | "ASSET_MANQUANT" | "A_VALIDER";
  sampleProducts: string[];
};

export type SumUpEliquideAnalysis = {
  generatedAt: string;
  source: string;
  totalCsvRows: number;
  eliquidesAnalyzed: number;
  manufacturersDetected: number;
  manufacturers: DetectedManufacturer[];
  assetManquant: string[];
  aValider: Array<{ slug: string; name: string; count: number }>;
  duplicates: Array<{ name: string; slugs: string[] }>;
  productsWithoutManufacturer: number;
  sampleWithout: Array<{ name: string; category: string }>;
  productLinks: Array<{
    name: string;
    category: string;
    barcode: string | null;
    itemId: string | null;
    manufacturerSlug: string | null;
    manufacturerName: string | null;
    status: string;
  }>;
};

const ROOT = process.cwd();
const DEFAULT_CSV = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const YOANN = path.join(ROOT, "data", "catalog", "yoann", "allvaps_catalogue.json");
const MEDIA = path.join(ROOT, "public", "media", "manufacturers");

/** Slugs Yoann → slug dossier media / URL catalogue (orthographe uniquement). */
const SLUG_CANONICAL: Record<string, string> = {
  etasty: "e-tasty",
  "yum-ebot": "yum-ebot",
  "made-in-vape-distrib": "made-in-vape-distrib",
  "cookin-cloud": "cookin-cloud",
};

/** Alias orthographiques (même fabricant) — jamais de fusion entre marques distinctes. */
const EXTRA_ALIASES: Record<string, string[]> = {
  "e-tasty": ["etasty", "e tasty", "e.tasty", "e. tasty"],
  liquidarom: ["liquid arom"],
  "juice-66": ["juice 66", "juice66", "66 juice"],
  "t-juice": ["tjuice", "t juice"],
  "the-fuu": ["the fuu", "fuu"],
  "vape-47": ["vape 47", "vape47"],
  "cloud-vapor": ["cloud vapor"],
  "biarritz-lab": ["biarritz lab", "biarrtiz lab"],
  "cookin-cloud": ["cookin cloud", "cookin'cloud", "cooking cloud"],
  "eliquid-france": ["eliquid france", "e liquid france", "e-liquid france"],
  "raneki-liquide": ["raneki", "raneki liquide"],
  "liquide-lab": ["liquide lab", "liquidelab"],
  airmust: ["air must", "airmust", "air max must"],
  "aromes-secrets": [
    "aromes & secrets",
    "aromes and secrets",
    "arômes & secrets",
    "aromes secrets",
  ],
  "mexican-cartel": ["mexican cartel"],
  "fruity-cool": ["fruity cool"],
  "vape-city": ["vape city"],
  "revenge-juices": ["revenge juices", "revenge juice"],
  "kf-studio": ["kf studio"],
  "big-kawa": ["big kawa"],
  "yum-ebot": ["yum e-bot", "yum ebot", "yum-ebot"],
  "le-maudit": ["le maudit"],
  "tribal-force": ["tribal force", "tribal lords"],
  "vape-maker": ["vape maker"],
  "maison-fuel": ["maison fuel", "fighter fuel"],
  curieux: ["curieux"],
  "secrets-lab": ["secrets lab", "secret's lab", "secrets keys", "secret's keys"],
  protect: ["protect"],
  "vap-air": ["vap air", "vap'air", "vapair"],
};

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isEliquideCategory(cat: string): boolean {
  const c = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /e-?\s*liquide/.test(c);
}

export function looksLikeEliquidName(name: string): boolean {
  if (name.length > 120 || /https?:\/\//i.test(name)) return false;
  return /\b(\d+\s*ml|mg\/?ml|0\s*mg|3\s*mg|6\s*mg|12\s*mg|16\s*mg|18\s*mg|20\s*mg)\b/i.test(
    name
  );
}

export function hasOfficialLogo(slug: string): boolean {
  const dir = path.join(MEDIA, slug);
  return ["logo-on-dark.webp", "logo.webp", "logo.png", "logo.svg"].some((f) =>
    fs.existsSync(path.join(dir, f))
  );
}

export function hasManufacturerBanner(slug: string): boolean {
  return fs.existsSync(path.join(MEDIA, slug, "banner.webp"));
}

export function loadKnownManufacturers(): KnownManufacturer[] {
  const map = new Map<string, KnownManufacturer>();

  if (fs.existsSync(YOANN)) {
    const j = JSON.parse(fs.readFileSync(YOANN, "utf8")) as {
      manufacturers?: Array<{
        id?: string;
        name?: string;
        slug?: string;
        aliases?: string[];
      }>;
    };
    for (const m of j.manufacturers || []) {
      if (!m.name) continue;
      const rawSlug = m.slug || m.id || slugify(m.name);
      const slug = SLUG_CANONICAL[rawSlug] || rawSlug;
      map.set(slug, {
        name: m.name,
        slug,
        aliases: [...(m.aliases || []), rawSlug, m.id || ""].filter(Boolean),
      });
    }
  }

  if (fs.existsSync(MEDIA)) {
    for (const d of fs.readdirSync(MEDIA, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const slug = d.name;
      if (!map.has(slug)) {
        map.set(slug, {
          name: slug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          slug,
          aliases: [],
        });
      }
    }
  }

  // Marques fréquemment présentes dans SumUp (orthographe), sans fusion douteuse
  const SUMUP_SEEN: KnownManufacturer[] = [
    { name: "Liquidarom", slug: "liquidarom", aliases: [] },
    { name: "Tribal Force", slug: "tribal-force", aliases: ["Tribal Lords"] },
    { name: "Vape Maker", slug: "vape-maker", aliases: [] },
    { name: "Maison Fuel", slug: "maison-fuel", aliases: ["Fighter Fuel"] },
    { name: "Curieux", slug: "curieux", aliases: [] },
    { name: "Secret's Lab", slug: "secrets-lab", aliases: ["Secrets Lab"] },
    { name: "Vap Air", slug: "vap-air", aliases: ["Vap'Air", "VapAir"] },
    {
      name: "All Vap's",
      slug: "all-vaps",
      aliases: ["All Vaps", "AllVaps", "All Vap’s"],
    },
  ];
  for (const m of SUMUP_SEEN) {
    if (!map.has(m.slug)) map.set(m.slug, m);
  }

  for (const [slug, aliases] of Object.entries(EXTRA_ALIASES)) {
    const m = map.get(slug);
    if (m) m.aliases = [...new Set([...m.aliases, ...aliases])];
  }

  return [...map.values()];
}

function matchManufacturer(
  productName: string,
  known: KnownManufacturer[]
): {
  manufacturerName: string;
  manufacturerSlug: string;
  method: string;
  confidence: "high" | "medium" | "low";
} | null {
  const n = norm(productName);
  if (!n) return null;

  const ranked = [...known].sort((a, b) => {
    const score = (m: KnownManufacturer) =>
      Math.max(norm(m.name).length, ...m.aliases.map((x) => norm(x).length), 0);
    return score(b) - score(a);
  });

  for (const m of ranked) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")]
      .map(norm)
      .filter((x) => x.length >= 3);
    for (const needle of needles) {
      if (n.includes(needle)) {
        return {
          manufacturerName: m.name,
          manufacturerSlug: m.slug,
          method: "alias",
          confidence: needle.length >= 5 ? "high" : "medium",
        };
      }
    }
  }

  const by = productName.match(/\bby\s+([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})$/i);
  if (by?.[1]) {
    const raw = by[1].trim();
    // Rejeter les suffixes qui sont clairement une contenance / nicotine
    if (/^\d+\s*ml/i.test(raw) || /^\d+\s*mg/i.test(raw)) return null;
    const slug = slugify(raw);
    const hit = known.find((k) => k.slug === slug || norm(k.name) === norm(raw));
    if (hit) {
      return {
        manufacturerName: hit.name,
        manufacturerSlug: hit.slug,
        method: "trailing_by",
        confidence: "high",
      };
    }
    return {
      manufacturerName: raw,
      manufacturerSlug: slug,
      method: "a_valider",
      confidence: "low",
    };
  }

  return null;
}

export function analyzeSumUpEliquideManufacturers(csvPath = DEFAULT_CSV): SumUpEliquideAnalysis {
  if (!fs.existsSync(csvPath)) throw new Error(`CSV SumUp introuvable: ${csvPath}`);
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const known = loadKnownManufacturers();

  type Row = {
    name: string;
    category: string;
    barcode: string | null;
    itemId: string | null;
    manufacturerName: string | null;
    manufacturerSlug: string | null;
    method: string | null;
    confidence: string | null;
  };

  const eliquides: Row[] = [];
  for (const r of rows) {
    const name = (r["item name"] || r.name || "").trim();
    if (!name || name.length > 120 || /https?:\/\//i.test(name)) continue;
    const category = (r.category || "").trim();
    const isEli =
      isEliquideCategory(category) ||
      (!category && looksLikeEliquidName(name));
    if (!isEli) continue;

    const m = matchManufacturer(name, known);
    eliquides.push({
      name,
      category,
      barcode: (r.barcode || "").trim() || null,
      itemId: (r["item id (do not change)"] || "").trim() || null,
      manufacturerName: m?.manufacturerName || null,
      manufacturerSlug: m?.manufacturerSlug || null,
      method: m?.method || null,
      confidence: m?.confidence || null,
    });
  }

  const byMfr = new Map<
    string,
    {
      name: string;
      slug: string;
      count: number;
      aValider: boolean;
      hasLogo: boolean;
      samples: string[];
    }
  >();
  let without = 0;
  const sampleWithout: Array<{ name: string; category: string }> = [];

  for (const e of eliquides) {
    if (!e.manufacturerSlug) {
      without += 1;
      if (sampleWithout.length < 40) sampleWithout.push({ name: e.name, category: e.category });
      continue;
    }
    if (e.method === "a_valider" || e.confidence === "low") {
      const key = e.manufacturerSlug;
      if (!byMfr.has(key)) {
        byMfr.set(key, {
          name: e.manufacturerName || key,
          slug: key,
          count: 0,
          aValider: true,
          hasLogo: hasOfficialLogo(key),
          samples: [],
        });
      }
      const row = byMfr.get(key)!;
      row.count += 1;
      row.aValider = true;
      if (row.samples.length < 5) row.samples.push(e.name);
      continue;
    }

    const key = e.manufacturerSlug;
    if (!byMfr.has(key)) {
      byMfr.set(key, {
        name: e.manufacturerName!,
        slug: key,
        count: 0,
        aValider: false,
        hasLogo: hasOfficialLogo(key),
        samples: [],
      });
    }
    const row = byMfr.get(key)!;
    row.count += 1;
    if (row.samples.length < 5) row.samples.push(e.name);
  }

  const manufacturers: DetectedManufacturer[] = [...byMfr.values()]
    .sort((a, b) => b.count - a.count)
    .map((m) => ({
      name: m.name,
      slug: m.slug,
      productCount: m.count,
      hasOfficialLogo: m.hasLogo,
      status: m.aValider
        ? "A_VALIDER"
        : m.hasLogo
          ? "LOGO_OK"
          : "ASSET_MANQUANT",
      sampleProducts: m.samples,
    }));

  const nameNorm = new Map<string, string[]>();
  for (const m of manufacturers) {
    const k = norm(m.name);
    if (!nameNorm.has(k)) nameNorm.set(k, []);
    nameNorm.get(k)!.push(m.slug);
  }
  const duplicates = [...nameNorm.entries()]
    .filter(([, slugs]) => new Set(slugs).size > 1)
    .map(([name, slugs]) => ({ name, slugs: [...new Set(slugs)] }));

  return {
    generatedAt: new Date().toISOString(),
    source: path.basename(csvPath),
    totalCsvRows: rows.length,
    eliquidesAnalyzed: eliquides.length,
    manufacturersDetected: manufacturers.filter((m) => m.status !== "A_VALIDER").length,
    manufacturers,
    assetManquant: manufacturers
      .filter((m) => m.status === "ASSET_MANQUANT")
      .map((m) => m.slug),
    aValider: manufacturers
      .filter((m) => m.status === "A_VALIDER")
      .map((m) => ({ slug: m.slug, name: m.name, count: m.productCount })),
    duplicates,
    productsWithoutManufacturer: without,
    sampleWithout,
    productLinks: eliquides.map((e) => ({
      name: e.name,
      category: e.category,
      barcode: e.barcode,
      itemId: e.itemId,
      manufacturerSlug: e.method === "a_valider" ? null : e.manufacturerSlug,
      manufacturerName: e.method === "a_valider" ? null : e.manufacturerName,
      status:
        e.method === "a_valider"
          ? "A_VALIDER"
          : e.manufacturerSlug
            ? "LINKED"
            : "NO_MANUFACTURER",
    })),
  };
}

/** Fabricants SumUp confirmés sans bannière `banner.webp`. */
export function manufacturersMissingBanners(
  analysis: SumUpEliquideAnalysis
): DetectedManufacturer[] {
  return analysis.manufacturers.filter(
    (m) => m.status !== "A_VALIDER" && !hasManufacturerBanner(m.slug)
  );
}
