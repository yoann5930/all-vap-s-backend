/**
 * Analyse SumUp → fabricants e-liquides (lecture seule).
 * Source : inbox_sumup CSV officiel (pas de liste inventée).
 *
 * Usage: npx tsx scripts/analyse-sumup-eliquide-fabricants.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../lib/import/csv";
import { slugify } from "../lib/utils";

const ROOT = process.cwd();
const CSV = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const YOANN = path.join(ROOT, "data", "catalog", "yoann", "allvaps_catalogue.json");
const MEDIA = path.join(ROOT, "public", "media", "manufacturers");
const OUT = path.join(ROOT, "rapports", "sumup-eliquide-fabricants-latest.json");

/** Catégories SumUp typiques e-liquides (détectées dans le CSV, pas inventées). */
function isEliquideCategory(cat: string): boolean {
  const c = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!c) return false;
  // Exclusions matérielles / accessoires
  if (
    /\b(box|mod|pod|kit|accu|batter|chargeur|resistance|coil|drip|verre|clearom|atom|coton|diy|arome concentre|booster seul|puff|jetable|dispos)\b/.test(
      c
    )
  ) {
    return false;
  }
  return (
    /e-?\s*liquide/.test(c) ||
    /\bliquide\b/.test(c) ||
    /nicotine salt|sels?\s*de\s*nicotine/.test(c) ||
    /\b50\s*ml\b/.test(c) ||
    /\b100\s*ml\b/.test(c) ||
    /\b10\s*ml\b/.test(c) ||
    /shortfill|longfill|ready.to.vape|pret.a.vaper/.test(c)
  );
}

/** Heuristique nom produit : volume e-liquide classique. */
function looksLikeEliquidName(name: string): boolean {
  const n = name.toLowerCase();
  if (name.length > 120 || /https?:\/\//i.test(name)) return false;
  return /\b(\d+\s*ml|mg\/?ml|0mg|3mg|6mg|12mg|16mg|18mg|20mg)\b/i.test(n);
}

type KnownMfr = { name: string; slug: string; aliases: string[] };

function loadKnownFromYoann(): KnownMfr[] {
  if (!fs.existsSync(YOANN)) return [];
  const j = JSON.parse(fs.readFileSync(YOANN, "utf8")) as {
    manufacturers?: Array<{ id?: string; name?: string; slug?: string; aliases?: string[] }>;
    fabricants?: Array<{ id?: string; name?: string; slug?: string }>;
  };
  const list = j.manufacturers || j.fabricants || [];
  return list
    .filter((m) => m.name)
    .map((m) => ({
      name: m.name!,
      slug: m.slug || m.id || slugify(m.name!),
      aliases: (m.aliases || []).map(String),
    }));
}

function loadKnownFromMediaDirs(): KnownMfr[] {
  if (!fs.existsSync(MEDIA)) return [];
  return fs
    .readdirSync(MEDIA, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      slug: d.name,
      aliases: [] as string[],
    }));
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasLogo(slug: string): boolean {
  const dir = path.join(MEDIA, slug);
  return ["logo-on-dark.webp", "logo.webp", "logo.png", "logo.svg"].some((f) =>
    fs.existsSync(path.join(dir, f))
  );
}

type Match = {
  manufacturerName: string;
  manufacturerSlug: string;
  method: "alias" | "name_token" | "trailing_by" | "a_valider";
  confidence: "high" | "medium" | "low";
};

function matchManufacturer(productName: string, known: KnownMfr[]): Match | null {
  const n = norm(productName);
  if (!n) return null;

  // Longer aliases / names first to avoid partial collisions
  const ranked = [...known].sort(
    (a, b) =>
      Math.max(norm(b.name).length, ...b.aliases.map((x) => norm(x).length), 0) -
      Math.max(norm(a.name).length, ...a.aliases.map((x) => norm(x).length), 0)
  );

  for (const m of ranked) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")].map(norm).filter(Boolean);
    for (const needle of needles) {
      if (needle.length < 3) continue;
      // word-boundary-ish
      const re = new RegExp(`(?:^|\\s)${needle.replace(/\s+/g, "\\s+")}(?:\\s|$)`);
      if (re.test(n) || n.includes(needle)) {
        // Prefer high confidence when needle is distinctive (>=4 chars)
        return {
          manufacturerName: m.name,
          manufacturerSlug: m.slug,
          method: "alias",
          confidence: needle.length >= 5 ? "high" : "medium",
        };
      }
    }
  }

  // Pattern " … by Brand" / " – Brand"
  const by = productName.match(/\bby\s+([A-Za-z0-9][A-Za-z0-9 &.'-]{1,40})$/i);
  if (by?.[1]) {
    const raw = by[1].trim();
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

function main() {
  if (!fs.existsSync(CSV)) throw new Error(`CSV manquant: ${CSV}`);
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  // Discover categories present
  const categoryCounts = new Map<string, number>();
  for (const r of rows) {
    const cat = (r.category || "").trim() || "(vide)";
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  const knownMap = new Map<string, KnownMfr>();
  for (const m of [...loadKnownFromYoann(), ...loadKnownFromMediaDirs()]) {
    if (!knownMap.has(m.slug)) knownMap.set(m.slug, m);
    else {
      const cur = knownMap.get(m.slug)!;
      cur.aliases = [...new Set([...cur.aliases, ...m.aliases])];
    }
  }
  // Manual safe aliases ONLY for orthography (same brand), not mergers
  const EXTRA_ALIASES: Record<string, string[]> = {
    liquidarom: ["liquid arom", "liquida rom"],
    "e-tasty": ["etasty", "e tasty"],
    liquideo: ["liquideo fr"],
    "juice-66": ["juice 66", "juice66"],
    "t-juice": ["tjuice", "t juice"],
    "the-fuu": ["the fuu", "fuu"],
    "vape-47": ["vape 47", "vape47"],
    "cloud-vapor": ["cloud vapor"],
    "biarritz-lab": ["biarritz lab"],
    "cookin-cloud": ["cookin cloud", "cooking cloud"],
    "eliquid-france": ["eliquid france", "e liquid france"],
    "raneki-liquide": ["raneki", "raneki liquide"],
    "liquide-lab": ["liquide lab", "liquidelab"],
    airmust: ["air must"],
    swoke: ["swoke"],
    protect: ["protect"],
    avap: ["avap", "a vap"],
    "aromes-secrets": ["aromes & secrets", "aromes and secrets", "arômes & secrets"],
  };
  for (const [slug, aliases] of Object.entries(EXTRA_ALIASES)) {
    const m = knownMap.get(slug);
    if (m) m.aliases = [...new Set([...m.aliases, ...aliases])];
  }

  const known = [...knownMap.values()];

  type RowOut = {
    name: string;
    category: string;
    barcode: string | null;
    itemId: string | null;
    manufacturerName: string | null;
    manufacturerSlug: string | null;
    method: string | null;
    confidence: string | null;
  };

  const eliquides: RowOut[] = [];
  for (const r of rows) {
    const name = (r["item name"] || r.name || "").trim();
    if (!name || name.length > 120 || /https?:\/\//i.test(name)) continue;
    const category = (r.category || "").trim();
    const isEli =
      isEliquideCategory(category) ||
      (looksLikeEliquidName(name) && /liquide|e-liquide|ml/i.test(category + " " + name));
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
    { name: string; slug: string; count: number; aValider: boolean; hasLogo: boolean }
  >();
  let without = 0;
  let aValider: Array<{ name: string; guessed: string }> = [];

  for (const e of eliquides) {
    if (!e.manufacturerSlug || e.method === "a_valider" || e.confidence === "low") {
      if (e.method === "a_valider" && e.manufacturerSlug) {
        aValider.push({ name: e.name, guessed: e.manufacturerName || "" });
        const key = e.manufacturerSlug;
        if (!byMfr.has(key)) {
          byMfr.set(key, {
            name: e.manufacturerName || key,
            slug: key,
            count: 0,
            aValider: true,
            hasLogo: hasLogo(key),
          });
        }
        byMfr.get(key)!.count += 1;
        byMfr.get(key)!.aValider = true;
      } else {
        without += 1;
      }
      continue;
    }
    const key = e.manufacturerSlug;
    if (!byMfr.has(key)) {
      byMfr.set(key, {
        name: e.manufacturerName!,
        slug: key,
        count: 0,
        aValider: false,
        hasLogo: hasLogo(key),
      });
    }
    byMfr.get(key)!.count += 1;
  }

  const manufacturers = [...byMfr.values()].sort((a, b) => b.count - a.count);
  const withLogo = manufacturers.filter((m) => m.hasLogo && !m.aValider);
  const missingLogo = manufacturers.filter((m) => !m.hasLogo && !m.aValider);
  const toValidate = manufacturers.filter((m) => m.aValider);

  // Duplicate slug/name checks
  const nameNorm = new Map<string, string[]>();
  for (const m of manufacturers) {
    const k = norm(m.name);
    if (!nameNorm.has(k)) nameNorm.set(k, []);
    nameNorm.get(k)!.push(m.slug);
  }
  const duplicates = [...nameNorm.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([name, slugs]) => ({ name, slugs }));

  const report = {
    generatedAt: new Date().toISOString(),
    source: path.basename(CSV),
    totalCsvRows: rows.length,
    eliquidesAnalyzed: eliquides.length,
    categoryHistogram: [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40),
    manufacturersDetected: manufacturers.length,
    manufacturers: manufacturers.map((m) => ({
      name: m.name,
      slug: m.slug,
      productCount: m.count,
      hasOfficialLogo: m.hasLogo,
      status: m.aValider ? "A_VALIDER" : m.hasLogo ? "LOGO_OK" : "ASSET_MANQUANT",
    })),
    withOfficialLogo: withLogo.map((m) => m.slug),
    assetManquant: missingLogo.map((m) => m.slug),
    aValider: toValidate.map((m) => ({ slug: m.slug, name: m.name, count: m.count })),
    aValiderSamples: aValider.slice(0, 30),
    duplicates,
    productsWithoutManufacturer: without,
    sampleWithout: eliquides
      .filter((e) => !e.manufacturerSlug || e.confidence === "low")
      .slice(0, 40)
      .map((e) => ({ name: e.name, category: e.category })),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        eliquidesAnalyzed: report.eliquidesAnalyzed,
        manufacturersDetected: report.manufacturersDetected,
        withOfficialLogo: withLogo.length,
        assetManquant: missingLogo.length,
        aValider: toValidate.length,
        productsWithoutManufacturer: without,
        manufacturers: manufacturers.map((m) => `${m.name} (${m.count}) [${m.hasLogo ? "logo" : "MANQUANT"}]`),
        report: OUT,
      },
      null,
      2
    )
  );
}

main();
