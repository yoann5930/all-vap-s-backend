/**
 * AUDIT COMPLET — E-liquides SumUp → Fabricant → Gamme → Produits
 * Lecture seule par défaut. Aucune invention de fabricant/gamme.
 *
 * Usage:
 *   npx tsx scripts/audit-eliquide-fabricant-gamme-sumup.ts
 *   npx tsx scripts/audit-eliquide-fabricant-gamme-sumup.ts --apply-safe
 */
import fs from "node:fs";
import path from "node:path";
import {
  analyzeSumUpEliquideManufacturers,
  hasOfficialLogo,
  hasManufacturerBanner,
  loadKnownManufacturers,
  norm,
} from "../lib/catalog/sumup-eliquide-manufacturers";
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
const OUT_JSON = path.join(ROOT, "rapports", "audit-eliquide-fabricant-gamme-latest.json");
const OUT_MD = path.join(ROOT, "docs", "AUDIT_ELIQUIDES_FABRICANTS_GAMMES_SUMUP.md");
const APPLY_SAFE = process.argv.includes("--apply-safe");

/** Appellations vues à l’écran / pièges connus — à croiser avec SumUp, pas une liste fermée. */
const SCREEN_HINTS = [
  "vap-air",
  "vape-47",
  "vape-maker",
  "yum-ebot",
  "maison-fuel",
  "secrets-lab",
  "my-store",
  "classic",
  "t-juice",
  "liquidarom",
  "liquidarom-en-provence",
  "mexican-cartel",
  "protect",
  "big-kawa",
  "alfa",
  "biarritz-lab",
  "biarrtiz-lab",
  "eliquid-france",
  "e-tasty",
  "airmust",
];

type YoannRange = { name: string; slug: string; productNames: string[] };
type YoannMfr = { id: string; name: string; slug: string; ranges: YoannRange[] };

function loadYoann(): YoannMfr[] {
  if (!fs.existsSync(YOANN)) return [];
  const j = JSON.parse(fs.readFileSync(YOANN, "utf8")) as {
    manufacturers: Array<{
      id: string;
      name: string;
      aliases?: string[];
      ranges: Array<{ name: string; products?: Array<{ name?: string }> }>;
    }>;
  };
  const SLUG_CANON: Record<string, string> = { etasty: "e-tasty" };
  return j.manufacturers.map((m) => {
    const slug = SLUG_CANON[m.id] || m.id;
    return {
      id: m.id,
      name: m.name,
      slug,
      ranges: (m.ranges || []).map((r) => ({
        name: r.name,
        slug: slugify(r.name),
        productNames: (r.products || []).map((p) => p.name || "").filter(Boolean),
      })),
    };
  });
}

function isEliquideRow(category: string, name: string): boolean {
  const c = category.toLowerCase();
  if (/e-?\s*liquide/.test(c)) return true;
  if (!category && /\b\d+\s*ml\b/i.test(name) && name.length <= 120) return true;
  return false;
}

type Extracted = {
  name: string;
  category: string;
  barcode: string | null;
  itemId: string | null;
  manufacturerSlug: string | null;
  manufacturerName: string | null;
  rangeHint: string | null;
  rangeSlug: string | null;
  confidence: "high" | "medium" | "low" | "none";
  notes: string[];
};

/**
 * Extrait fabricant + indice de gamme depuis le nom SumUp.
 * Patterns certains uniquement.
 */
function extractFromName(
  productName: string,
  known: ReturnType<typeof loadKnownManufacturers>,
  yoannBySlug: Map<string, YoannMfr>
): Omit<Extracted, "name" | "category" | "barcode" | "itemId"> {
  const notes: string[] = [];
  const n = norm(productName);

  // Pattern: "… - {Range} by {Brand}"
  const rangeBy = productName.match(
    /\s[-–—]\s*([A-Za-z0-9][A-Za-z0-9 &'’.-]{1,40})\s+by\s+([A-Za-z0-9][A-Za-z0-9 &'’.-]{1,40})(?:\s|$)/i
  );
  if (rangeBy) {
    const rangeName = rangeBy[1]!.trim();
    const brandRaw = rangeBy[2]!.trim();
    if (!/^\d+\s*ml/i.test(brandRaw) && !/^\d+\s*mg/i.test(brandRaw)) {
      const mfr = matchKnown(brandRaw, known);
      if (mfr) {
        const rangeSlug = slugify(rangeName);
        const yo = yoannBySlug.get(mfr.slug);
        const yoRange = yo?.ranges.find(
          (r) => norm(r.name) === norm(rangeName) || r.slug === rangeSlug
        );
        return {
          manufacturerSlug: mfr.slug,
          manufacturerName: mfr.name,
          rangeHint: yoRange?.name || rangeName,
          rangeSlug: yoRange?.slug || rangeSlug,
          confidence: yoRange ? "high" : "medium",
          notes: yoRange
            ? ["range_match_yoann"]
            : ["range_from_name_not_in_yoann"],
        };
      }
      notes.push(`brand_by_unknown:${brandRaw}`);
    }
  }

  // Pattern: "… by {Brand}"
  const byOnly = productName.match(
    /\bby\s+([A-Za-z0-9][A-Za-z0-9 &'’.-]{1,40})(?:\s|$)/i
  );
  if (byOnly) {
    const brandRaw = byOnly[1]!.trim();
    if (!/^\d+\s*ml/i.test(brandRaw) && !/^\d+\s*mg/i.test(brandRaw)) {
      const mfr = matchKnown(brandRaw, known);
      if (mfr) {
        const yo = yoannBySlug.get(mfr.slug);
        // Try to find a Yoann range whose name appears in the product
        let rangeHint: string | null = null;
        let rangeSlug: string | null = null;
        let conf: "high" | "medium" = "medium";
        if (yo) {
          const ranked = [...yo.ranges].sort(
            (a, b) => norm(b.name).length - norm(a.name).length
          );
          for (const r of ranked) {
            if (norm(r.name).length >= 3 && n.includes(norm(r.name))) {
              rangeHint = r.name;
              rangeSlug = r.slug;
              conf = "high";
              notes.push("range_token_yoann");
              break;
            }
          }
        }
        return {
          manufacturerSlug: mfr.slug,
          manufacturerName: mfr.name,
          rangeHint,
          rangeSlug,
          confidence: conf,
          notes,
        };
      }
      return {
        manufacturerSlug: slugify(brandRaw),
        manufacturerName: brandRaw,
        rangeHint: null,
        rangeSlug: null,
        confidence: "low",
        notes: [`a_valider_by:${brandRaw}`],
      };
    }
  }

  // Known manufacturer substring
  const ranked = [...known].sort(
    (a, b) =>
      Math.max(norm(b.name).length, ...b.aliases.map((x) => norm(x).length)) -
      Math.max(norm(a.name).length, ...a.aliases.map((x) => norm(x).length))
  );
  for (const m of ranked) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")]
      .map(norm)
      .filter((x) => x.length >= 3);
    for (const needle of needles) {
      if (n.includes(needle)) {
        const yo = yoannBySlug.get(m.slug);
        let rangeHint: string | null = null;
        let rangeSlug: string | null = null;
        let conf: "high" | "medium" = "medium";
        if (yo) {
          const rankedR = [...yo.ranges].sort(
            (a, b) => norm(b.name).length - norm(a.name).length
          );
          for (const r of rankedR) {
            if (norm(r.name).length >= 3 && n.includes(norm(r.name))) {
              rangeHint = r.name;
              rangeSlug = r.slug;
              conf = "high";
              notes.push("range_token_yoann");
              break;
            }
          }
        }
        // Liquidarom Ice Cool / Ice Cool X
        if (m.slug === "liquidarom") {
          if (/ice\s*cool\s*x/i.test(productName)) {
            rangeHint = "Ice Cool X";
            rangeSlug = "ice-cool-x";
            conf = "high";
          } else if (/ice\s*cool/i.test(productName)) {
            rangeHint = "Ice Cool";
            rangeSlug = "ice-cool";
            conf = "high";
          }
        }
        return {
          manufacturerSlug: m.slug,
          manufacturerName: m.name,
          rangeHint,
          rangeSlug,
          confidence: conf,
          notes: ["mfr_alias_match", ...notes],
        };
      }
    }
  }

  return {
    manufacturerSlug: null,
    manufacturerName: null,
    rangeHint: null,
    rangeSlug: null,
    confidence: "none",
    notes: ["no_manufacturer"],
  };
}

function matchKnown(
  raw: string,
  known: ReturnType<typeof loadKnownManufacturers>
) {
  const n = norm(raw);
  for (const m of known) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")].map(norm);
    if (needles.some((x) => x === n || (x.length >= 3 && n.includes(x)))) return m;
  }
  return null;
}

function hasRangeCover(mfrSlug: string, rangeSlug: string): boolean {
  const dir = path.join(MEDIA, mfrSlug, "ranges");
  const bases = [rangeSlug];
  if (!rangeSlug.endsWith(`-${mfrSlug}`)) bases.push(`${rangeSlug}-${mfrSlug}`);
  else {
    const short = rangeSlug.slice(0, -(mfrSlug.length + 1));
    if (short) bases.push(short);
  }
  return bases.some((base) =>
    ["webp", "jpg", "jpeg", "png"].some((ext) =>
      fs.existsSync(path.join(dir, `${base}.${ext}`))
    )
  );
}

async function main() {
  const analysis = analyzeSumUpEliquideManufacturers(CSV);
  const known = loadKnownManufacturers();
  const yoann = loadYoann();
  const yoannBySlug = new Map(yoann.map((m) => [m.slug, m]));

  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const extracted: Extracted[] = [];
  for (const r of rows) {
    const name = (r["item name"] || "").trim();
    if (!name || name.length > 120 || /https?:\/\//i.test(name)) continue;
    const category = (r.category || "").trim();
    if (!isEliquideRow(category, name)) continue;
    const ex = extractFromName(name, known, yoannBySlug);
    extracted.push({
      name,
      category,
      barcode: (r.barcode || "").trim() || null,
      itemId: (r["item id (do not change)"] || "").trim() || null,
      ...ex,
    });
  }

  // Aggregate per manufacturer
  type MfrAgg = {
    slug: string;
    name: string;
    productCount: number;
    withRange: number;
    withoutRange: number;
    ranges: Map<
      string,
      { name: string; slug: string; count: number; inYoann: boolean; hasCover: boolean }
    >;
    hasLogo: boolean;
    hasBanner: boolean;
    visual: "LOGO_OK" | "BANNER_TYPO_ONLY" | "ASSET_MANQUANT";
    anomalies: string[];
    proposedFixes: string[];
    sampleNoRange: string[];
  };

  const byMfr = new Map<string, MfrAgg>();
  const ambiguous: Array<{ product: string; reason: string }> = [];
  let noMfr = 0;

  for (const e of extracted) {
    if (!e.manufacturerSlug || e.confidence === "low") {
      if (e.confidence === "low") {
        ambiguous.push({
          product: e.name,
          reason: e.notes.join(",") || "low_confidence",
        });
      } else {
        noMfr += 1;
      }
      continue;
    }

    if (!byMfr.has(e.manufacturerSlug)) {
      const hasLogo = hasOfficialLogo(e.manufacturerSlug);
      const hasBanner = hasManufacturerBanner(e.manufacturerSlug);
      byMfr.set(e.manufacturerSlug, {
        slug: e.manufacturerSlug,
        name: e.manufacturerName || e.manufacturerSlug,
        productCount: 0,
        withRange: 0,
        withoutRange: 0,
        ranges: new Map(),
        hasLogo,
        hasBanner,
        visual: hasLogo
          ? "LOGO_OK"
          : hasBanner
            ? "BANNER_TYPO_ONLY"
            : "ASSET_MANQUANT",
        anomalies: [],
        proposedFixes: [],
        sampleNoRange: [],
      });
    }
    const agg = byMfr.get(e.manufacturerSlug)!;
    agg.productCount += 1;
    if (e.rangeSlug && e.rangeHint) {
      agg.withRange += 1;
      if (!agg.ranges.has(e.rangeSlug)) {
        const yo = yoannBySlug.get(e.manufacturerSlug);
        const inYoann = Boolean(
          yo?.ranges.some((r) => r.slug === e.rangeSlug || norm(r.name) === norm(e.rangeHint!))
        );
        agg.ranges.set(e.rangeSlug, {
          name: e.rangeHint,
          slug: e.rangeSlug,
          count: 0,
          inYoann,
          hasCover: hasRangeCover(e.manufacturerSlug, e.rangeSlug),
        });
      }
      agg.ranges.get(e.rangeSlug)!.count += 1;
    } else {
      agg.withoutRange += 1;
      if (agg.sampleNoRange.length < 8) agg.sampleNoRange.push(e.name);
    }
  }

  // Cross-check Yoann ranges missing from SumUp detection vs present
  for (const [slug, agg] of byMfr) {
    const yo = yoannBySlug.get(slug);
    if (!yo) {
      if (!["liquidarom", "maison-fuel", "vap-air", "vape-maker", "secrets-lab", "tribal-force"].includes(slug)) {
        agg.anomalies.push("fabricant_absent_du_referentiel_yoann");
      }
    } else {
      for (const r of yo.ranges) {
        if (!agg.ranges.has(r.slug) && r.productNames.length > 0) {
          agg.anomalies.push(`gamme_yoann_sans_match_sumup:${r.slug}`);
        }
      }
    }
    if (agg.visual === "BANNER_TYPO_ONLY") {
      agg.anomalies.push("carte_sans_logo_officiel_typo_only");
      agg.proposedFixes.push(
        "Conserver bannière typo + marquer ASSET_MANQUANT ; ne pas inventer de logo"
      );
    }
    if (agg.visual === "ASSET_MANQUANT") {
      agg.anomalies.push("aucun_visuel");
    }
    for (const r of agg.ranges.values()) {
      if (!r.hasCover) {
        agg.anomalies.push(`cover_gamme_manquant:${r.slug}`);
        agg.proposedFixes.push(
          `Ajouter cover officiel public/media/manufacturers/${slug}/ranges/${r.slug}.webp (pas d’invention)`
        );
      }
      if (!r.inYoann && r.count > 0) {
        agg.anomalies.push(`gamme_sumup_hors_yoann:${r.slug}`);
        agg.proposedFixes.push(
          `Valider si « ${r.name} » est une vraie gamme ${agg.name} ou un nom commercial`
        );
      }
    }
    if (agg.withoutRange > 0 && agg.withRange === 0) {
      agg.anomalies.push("aucune_gamme_identifiable_sur_produits_sumup");
    }
  }

  // False manufacturer candidates
  const FALSE_POSITIVE_SLUGS = ["my-store", "classic", "biarrtiz-lab", "liquidarom-en-provence"];
  const falsePositives = [...byMfr.keys()].filter((s) => FALSE_POSITIVE_SLUGS.includes(s));
  // Also: manufacturers that are actually Yoann ranges under another brand
  const rangeAsManufacturer: Array<{ slug: string; realManufacturer?: string }> = [];
  for (const [slug, agg] of byMfr) {
    for (const yo of yoann) {
      if (yo.slug === slug) continue;
      const hit = yo.ranges.find((r) => r.slug === slug || norm(r.name) === norm(agg.name));
      if (hit) {
        rangeAsManufacturer.push({
          slug,
          realManufacturer: yo.slug,
        });
        agg.anomalies.push(`possible_gamme_pas_fabricant:sous_${yo.slug}`);
        agg.proposedFixes.push(
          `Vérifier si « ${agg.name} » est une gamme de ${yo.name} plutôt qu’un fabricant`
        );
      }
    }
  }

  // Orthography duplicates
  const byNormName = new Map<string, string[]>();
  for (const m of byMfr.values()) {
    const k = norm(m.name);
    if (!byNormName.has(k)) byNormName.set(k, []);
    byNormName.get(k)!.push(m.slug);
  }
  const duplicates = [...byNormName.entries()]
    .filter(([, slugs]) => new Set(slugs).size > 1)
    .map(([name, slugs]) => ({ name, slugs: [...new Set(slugs)] }));

  // Screen hints status
  const screenStatus = SCREEN_HINTS.map((slug) => {
    const agg = byMfr.get(slug);
    return {
      slug,
      inSumUpAsManufacturer: Boolean(agg),
      productCount: agg?.productCount || 0,
      visual: agg?.visual || "ABSENT_SUMUP",
      anomalies: agg?.anomalies || [],
    };
  });

  const manufacturers = [...byMfr.values()]
    .sort((a, b) => b.productCount - a.productCount)
    .map((m) => ({
      ...m,
      ranges: [...m.ranges.values()].sort((a, b) => b.count - a.count),
    }));

  // DB snapshot (local)
  let dbSnapshot: unknown = null;
  if (APPLY_SAFE || true) {
    try {
      const { default: prisma } = await import("../lib/prisma");
      const dbMfrs = await prisma.manufacturer.findMany({
        where: { isActive: true },
        select: {
          slug: true,
          name: true,
          status: true,
          _count: { select: { products: true, ranges: true } },
          ranges: {
            select: {
              slug: true,
              name: true,
              status: true,
              verificationStatus: true,
              catalogVisible: true,
              _count: { select: { products: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      });
      dbSnapshot = dbMfrs.map((m) => ({
        slug: m.slug,
        name: m.name,
        status: m.status,
        products: m._count.products,
        ranges: m.ranges.map((r) => ({
          slug: r.slug,
          name: r.name,
          products: r._count.products,
          status: r.status,
          verificationStatus: r.verificationStatus,
          catalogVisible: r.catalogVisible,
          hasCover: hasRangeCover(m.slug, r.slug),
          eligibleHint:
            r.verificationStatus === "OFFICIAL_CONFIRMED" || r.status === "verifie",
        })),
      }));
      await prisma.$disconnect();
    } catch (e) {
      dbSnapshot = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: path.basename(CSV),
    eliquidesAnalyzed: extracted.length,
    manufacturersDetected: manufacturers.length,
    productsWithoutManufacturer: noMfr,
    ambiguousCount: ambiguous.length,
    manufacturers,
    screenHints: screenStatus,
    falsePositives,
    rangeAsManufacturer,
    duplicates,
    ambiguousSample: ambiguous.slice(0, 40),
    dbSnapshot,
    summaryAnomalies: manufacturers.flatMap((m) =>
      m.anomalies.map((a) => `${m.slug}: ${a}`)
    ),
  };

  // Markdown report
  const md: string[] = [];
  md.push("# AUDIT E-liquides — Fabricants & Gammes (SumUp)");
  md.push("");
  md.push(`**Date :** ${report.generatedAt}`);
  md.push(`**Source :** \`${report.source}\``);
  md.push("");
  md.push("## Synthèse");
  md.push("");
  md.push(`| Indicateur | Valeur |`);
  md.push(`|---|---|`);
  md.push(`| E-liquides SumUp analysés | **${report.eliquidesAnalyzed}** |`);
  md.push(`| Fabricants détectés | **${report.manufacturersDetected}** |`);
  md.push(`| Produits sans fabricant | **${noMfr}** |`);
  md.push(`| Ambiguïtés (à valider) | **${ambiguous.length}** |`);
  md.push(`| Doublons orthographiques | **${duplicates.length}** |`);
  md.push("");
  md.push("## Fabricant → gammes → produits → anomalies");
  md.push("");
  for (const m of manufacturers) {
    md.push(`### ${m.name} (\`${m.slug}\`)`);
    md.push("");
    md.push(`- Produits SumUp : **${m.productCount}** (dont ${m.withRange} avec gamme identifiable, ${m.withoutRange} sans)`);
    md.push(`- Visuel : **${m.visual}** (logo=${m.hasLogo}, banner=${m.hasBanner})`);
    if (m.ranges.length) {
      md.push(`- Gammes détectées :`);
      for (const r of m.ranges) {
        md.push(
          `  - **${r.name}** (\`${r.slug}\`) — ${r.count} prod. — Yoann=${r.inYoann ? "oui" : "non"} — cover=${r.hasCover ? "oui" : "**MANQUANT**"}`
        );
      }
    } else {
      md.push(`- Gammes détectées : *aucune identifiable avec certitude*`);
    }
    if (m.anomalies.length) {
      md.push(`- Anomalies :`);
      for (const a of m.anomalies) md.push(`  - ${a}`);
    }
    if (m.proposedFixes.length) {
      md.push(`- Corrections proposées :`);
      for (const f of [...new Set(m.proposedFixes)]) md.push(`  - ${f}`);
    }
    if (m.sampleNoRange.length) {
      md.push(`- Exemples sans gamme : ${m.sampleNoRange.map((s) => `\`${s}\``).join("; ")}`);
    }
    md.push("");
  }

  md.push("## Indices écran (captures) vs SumUp");
  md.push("");
  md.push("| Slug | Dans SumUp | Produits | Visuel |");
  md.push("|---|---|---|---|");
  for (const s of screenStatus) {
    md.push(
      `| ${s.slug} | ${s.inSumUpAsManufacturer ? "oui" : "non"} | ${s.productCount} | ${s.visual} |`
    );
  }
  md.push("");
  md.push("## À VALIDER (ne pas auto-corriger)");
  md.push("");
  if (!ambiguous.length && !rangeAsManufacturer.length && !falsePositives.length) {
    md.push("*Aucun cas bloquant listé — voir anomalies par fabricant.*");
  }
  for (const a of ambiguous.slice(0, 50)) {
    md.push(`- \`${a.product}\` — ${a.reason}`);
  }
  for (const r of rangeAsManufacturer) {
    md.push(
      `- **Possible gamme affichée comme fabricant :** \`${r.slug}\` → sous \`${r.realManufacturer}\` ?`
    );
  }
  for (const f of falsePositives) {
    md.push(`- **Faux fabricant à retirer :** \`${f}\``);
  }
  md.push("");
  md.push("## Corrections sûres recommandées (auto)");
  md.push("");
  md.push("1. Autoriser `banner.webp` comme fallback logo sur `/fabricants/[slug]` (évite 404 pour ASSET_MANQUANT typo).");
  md.push("2. Ne jamais créer de faux logos.");
  md.push("3. Créer en base les `ProductRange` Yoann **uniquement** quand cover officiel existe déjà + lier produits SumUp à confiance high.");
  md.push("4. Laisser hors publication les gammes sans cover / sans confirmation officielle.");
  md.push("");

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, md.join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        eliquidesAnalyzed: report.eliquidesAnalyzed,
        manufacturersDetected: report.manufacturersDetected,
        productsWithoutManufacturer: noMfr,
        ambiguous: ambiguous.length,
        falsePositives,
        rangeAsManufacturer,
        duplicates,
        reportJson: OUT_JSON,
        reportMd: OUT_MD,
      },
      null,
      2
    )
  );

  if (APPLY_SAFE) {
    await applySafeFixes(manufacturers);
  }
}

async function applySafeFixes(
  manufacturers: Array<{
    slug: string;
    name: string;
    ranges: Array<{
      name: string;
      slug: string;
      count: number;
      inYoann: boolean;
      hasCover: boolean;
    }>;
    hasLogo: boolean;
  }>
) {
  const { default: prisma } = await import("../lib/prisma");
  let rangesCreated = 0;
  let productsLinked = 0;

  for (const m of manufacturers) {
    const mfr = await prisma.manufacturer.findUnique({ where: { slug: m.slug } });
    if (!mfr) continue;
    let brand = await prisma.brand.findUnique({ where: { slug: m.slug } });
    if (!brand) {
      brand = await prisma.brand.create({
        data: {
          name: m.name,
          slug: m.slug,
          manufacturerId: mfr.id,
          isActive: true,
          status: m.hasLogo ? "verifie" : "partiel",
        },
      });
    }

    for (const r of m.ranges) {
      // Only create range if Yoann-confirmed OR has cover (official asset present)
      if (!r.inYoann && !r.hasCover) continue;
      if (!r.hasCover) {
        // Create range as a_verifier / not catalog visible — structure only
      }
      const existing = await prisma.productRange.findFirst({
        where: { brandId: brand.id, slug: r.slug },
      });
      let rangeId = existing?.id;
      if (!existing) {
        const created = await prisma.productRange.create({
          data: {
            brandId: brand.id,
            manufacturerId: mfr.id,
            name: r.name,
            slug: r.slug,
            isActive: true,
            status: r.hasCover && r.inYoann ? "verifie" : "a_verifier",
            verificationStatus:
              r.hasCover && r.inYoann ? "OFFICIAL_CONFIRMED" : "NEEDS_CONFIRMATION",
            catalogVisible: Boolean(r.hasCover && r.inYoann),
            sortOrder: 100,
          },
        });
        rangeId = created.id;
        rangesCreated += 1;
      }

      if (!rangeId || !r.hasCover || !r.inYoann) continue;

      // Link products by barcode from SumUp extract — done in separate pass below
    }
  }

  // Link high-confidence products: barcode match + range token
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const known = loadKnownManufacturers();
  const yoann = loadYoann();
  const yoannBySlug = new Map(yoann.map((m) => [m.slug, m]));

  for (const r of rows) {
    const name = (r["item name"] || "").trim();
    if (!name || !isEliquideRow(r.category || "", name)) continue;
    const ex = extractFromName(name, known, yoannBySlug);
    if (ex.confidence !== "high" || !ex.manufacturerSlug || !ex.rangeSlug) continue;
    const barcode = (r.barcode || "").trim();
    if (!barcode) continue;
    if (!hasRangeCover(ex.manufacturerSlug, ex.rangeSlug)) continue;

    const mfr = await prisma.manufacturer.findUnique({
      where: { slug: ex.manufacturerSlug },
    });
    const brand = await prisma.brand.findUnique({
      where: { slug: ex.manufacturerSlug },
    });
    const range = brand
      ? await prisma.productRange.findFirst({
          where: { brandId: brand.id, slug: ex.rangeSlug },
        })
      : null;
    if (!mfr || !range) continue;

    const product = await prisma.product.findFirst({
      where: { barcode },
      select: { id: true, manufacturerId: true, rangeId: true },
    });
    if (!product) continue;
    if (product.manufacturerId && product.manufacturerId !== mfr.id) continue;
    if (product.rangeId && product.rangeId !== range.id) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        manufacturerId: mfr.id,
        brandId: brand?.id,
        brand: mfr.name,
        rangeId: range.id,
        range: range.name,
      },
    });
    productsLinked += 1;
  }

  console.log(
    JSON.stringify({ applySafe: true, rangesCreated, productsLinked }, null, 2)
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
