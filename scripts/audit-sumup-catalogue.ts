/**
 * Audit SumUp CSV ↔ catalogue All Vap’s (lecture seule par défaut).
 *
 * Usage:
 *   npx tsx scripts/audit-sumup-catalogue.ts
 *   npm run sumup:catalog-audit
 *   npx tsx scripts/audit-sumup-catalogue.ts --apply-exact-only
 *
 * --apply-exact-only : remplit uniquement sumupProductId / barcode manquants
 *   pour MATCH_EXACT_EAN | MATCH_EXACT_REFERENCE | MATCH_VALIDATED_MAPPING
 *   (et confirme MATCH_EXACT_ID). Jamais prix, stock, image, suppression.
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";
import { isGroupPhotoUrl } from "../lib/catalog/images";

const APPLY_EXACT = process.argv.includes("--apply-exact-only");
const CSV_CANDIDATES = [
  path.resolve("inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv"),
  path.resolve("C:/Users/ASUS/Downloads/2026-08-03_16-46-54_items-export_MCGR4RXU.csv"),
];
const MAGASIN_CSV = path.resolve("catalogues/catalogue-magasin-all-vaps.csv");
const AVA_CSV = path.resolve("catalogues/catalogue-ava-all-vaps.csv");
const OUT_DIR = path.resolve("catalogues/rapports");
const REBUILD = path.resolve("data/rebuild");
const JOURNAL = path.resolve("backups/sumup-audit-2026-08-03/JOURNAL_APPLY_EXACT.json");

type MatchStatus =
  | "MATCH_EXACT_ID"
  | "MATCH_EXACT_EAN"
  | "MATCH_EXACT_REFERENCE"
  | "MATCH_VALIDATED_MAPPING"
  | "MATCH_STRICT_NAME"
  | "MATCH_REVIEW_REQUIRED"
  | "NO_MATCH"
  | "DUPLICATE"
  | "CONFLICT";

type ImageStatus =
  | "IMAGE_OK"
  | "IMAGE_MISSING"
  | "IMAGE_UNCERTAIN"
  | "IMAGE_WRONG_PRODUCT"
  | "IMAGE_WRONG_RANGE"
  | "IMAGE_WRONG_FORMAT"
  | "IMAGE_DUPLICATE_SUSPECT";

type PriceStatus =
  | "IDENTIQUE"
  | "DIFFÉRENT"
  | "MANQUANT_SUMUP"
  | "MANQUANT_CATALOGUE";

type SumUpRow = {
  rowIndex: number;
  name: string;
  itemId: string;
  variantId: string;
  barcode: string;
  sku: string;
  category: string;
  priceCents: number | null;
  quantity: number | null;
  description: string;
  raw: Record<string, string>;
};

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  reference: string | null;
  sumupProductId: string | null;
  sumupReference: string | null;
  sumupSku: string | null;
  sumupName: string | null;
  sumupMapping: string | null;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  imageStatus: string | null;
  volumeMl: number | null;
  isActive: boolean | null;
  visibleOnline: boolean | null;
  catalogStatus: string | null;
  manufacturerSlug: string | null;
  rangeSlug: string | null;
  hasAvaMeta: boolean;
};

function parseCsv(text: string, sep: "," | ";"): { headers: string[]; rows: Record<string, string>[] } {
  const raw = text.replace(/^\uFEFF/, "");
  // Parse respectant les guillemets multilignes
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
      if (row.some((cell) => cell.trim())) rowsRaw.push(row);
      row = [];
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((cell) => cell.trim())) rowsRaw.push(row);
  }
  if (!rowsRaw.length) return { headers: [], rows: [] };
  const headers = rowsRaw[0].map((h) => h.trim());
  const rows = rowsRaw.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}

function pick(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const a of aliases) {
    const hit = keys.find((k) => k.trim().toLowerCase() === a.toLowerCase());
    if (hit && row[hit]?.trim()) return row[hit].trim();
  }
  return "";
}

function parsePriceCents(raw: string): number | null {
  if (!raw?.trim()) return null;
  const n = Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function normalizeEan(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  // conserver zéros initiaux via string barcode original digits only
  return d;
}

function extractVolume(name: string): number | null {
  const m = name.match(/\b(\d+)\s*ml\b/i);
  return m ? Number(m[1]) : null;
}

function extractNicotine(name: string): number | null {
  const m = name.match(/\b(\d+(?:[.,]\d+)?)\s*mg\b/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

function isConcentrate(name: string): boolean {
  return /\bconcentr[eé]|ar[oô]me|diy\b/i.test(name);
}

function incompatiblePair(a: string, b: string): string | null {
  const va = extractVolume(a);
  const vb = extractVolume(b);
  if (va != null && vb != null && va !== vb) return "format_different";
  const na = extractNicotine(a);
  const nb = extractNicotine(b);
  if (na != null && nb != null && na !== nb) return "nicotine_differente";
  if (isConcentrate(a) !== isConcentrate(b)) return "concentre_vs_eliquide";
  return null;
}

function loadSumUp(csvPath: string): {
  encoding: string;
  separator: "," | ";";
  headers: string[];
  rows: SumUpRow[];
} {
  const buf = fs.readFileSync(csvPath);
  let encoding = "utf-8";
  let text: string;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    encoding = "utf-16le";
    text = buf.toString("utf16le");
  } else {
    text = buf.toString("utf8");
  }
  const first = text.split(/\r?\n/)[0] || "";
  const sep: "," | ";" = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const { headers, rows } = parseCsv(text, sep);
  const mapped: SumUpRow[] = rows.map((raw, i) => ({
    rowIndex: i + 2,
    name: pick(raw, ["Item name", "name", "nom"]).replace(/^\t+/, "").trim(),
    itemId: pick(raw, ["Item id (Do not change)", "Item id", "item_id"]),
    variantId: pick(raw, ["Variant id (Do not change)", "Variant id"]),
    barcode: pick(raw, ["Barcode", "EAN", "barcode"]),
    sku: pick(raw, ["SKU", "sku"]),
    category: pick(raw, ["Category", "category"]),
    priceCents: parsePriceCents(pick(raw, ["Price", "price"])),
    quantity: (() => {
      const q = pick(raw, ["Quantity", "quantity"]);
      const n = parseInt(q, 10);
      return Number.isFinite(n) ? n : null;
    })(),
    description: pick(raw, [
      "Description (Online Store and Invoices only)",
      "Description",
    ]),
    raw,
  }));
  return { encoding, separator: sep, headers, rows: mapped };
}

function classifyImage(p: CatalogProduct): ImageStatus {
  if (!p.imageUrl) return "IMAGE_MISSING";
  if (isGroupPhotoUrl(p.imageUrl)) return "IMAGE_WRONG_RANGE";
  const abs = path.join(process.cwd(), "public", p.imageUrl.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return "IMAGE_MISSING";
  if (p.imageStatus !== "official") return "IMAGE_UNCERTAIN";
  // Heuristic: path manufacturer mismatch
  if (p.manufacturerSlug && p.imageUrl.includes("/media/products/")) {
    const m = p.imageUrl.match(/\/media\/products\/([^/]+)\//);
    if (m && m[1] !== p.manufacturerSlug && m[1] !== "shared") {
      // allow common aliases
      const aliases: Record<string, string[]> = {
        "liquide-lab": ["liquidelab", "liquid-lab"],
        "e-tasty": ["etasty"],
        "vape-47": ["vape47"],
      };
      const ok = aliases[p.manufacturerSlug]?.includes(m[1]);
      if (!ok && m[1] !== p.manufacturerSlug) return "IMAGE_WRONG_PRODUCT";
    }
  }
  if (p.volumeMl != null && /\/(\d+)ml\//i.test(p.imageUrl)) {
    const vm = p.imageUrl.match(/\/(\d+)ml\//i);
    if (vm && Number(vm[1]) !== p.volumeMl) return "IMAGE_WRONG_FORMAT";
  }
  return "IMAGE_OK";
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

async function main() {
  const csvPath = CSV_CANDIDATES.find((p) => fs.existsSync(p));
  if (!csvPath) throw new Error("CSV SumUp introuvable (2026-08-03_16-46-54_items-export_MCGR4RXU.csv)");

  const zipFound = [
    path.resolve("catalogue-allvaps.zip"),
    path.resolve("C:/Users/ASUS/Downloads/catalogue-allvaps.zip"),
  ].find((p) => fs.existsSync(p));

  const sumup = loadSumUp(csvPath);
  const productsDb = await prisma.product.findMany({
    include: {
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true } },
      avaMeta: { select: { id: true } },
    },
  });

  const catalog: CatalogProduct[] = productsDb.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    barcode: p.barcode,
    reference: p.reference,
    sumupProductId: p.sumupProductId,
    sumupReference: p.sumupReference,
    sumupSku: p.sumupSku,
    sumupName: p.sumupName,
    sumupMapping: p.sumupMapping,
    priceCents: p.priceCents,
    stock: p.stock,
    imageUrl: p.imageUrl,
    imageStatus: p.imageStatus,
    volumeMl: p.volumeMl,
    isActive: p.isActive,
    visibleOnline: p.visibleOnline,
    catalogStatus: p.catalogStatus,
    manufacturerSlug: p.manufacturer?.slug ?? null,
    rangeSlug: p.rangeRef?.slug ?? null,
    hasAvaMeta: Boolean(p.avaMeta),
  }));

  // Indexes
  const bySumupId = new Map<string, CatalogProduct[]>();
  const byEan = new Map<string, CatalogProduct[]>();
  const byRef = new Map<string, CatalogProduct[]>();
  const byNormName = new Map<string, CatalogProduct[]>();
  for (const p of catalog) {
    if (p.sumupProductId) {
      const k = p.sumupProductId;
      if (!bySumupId.has(k)) bySumupId.set(k, []);
      bySumupId.get(k)!.push(p);
    }
    const ean = normalizeEan(p.barcode || "");
    if (ean) {
      if (!byEan.has(ean)) byEan.set(ean, []);
      byEan.get(ean)!.push(p);
    }
    for (const r of [p.reference, p.sumupReference, p.sumupSku].filter(Boolean) as string[]) {
      const k = r.trim().toLowerCase();
      if (!byRef.has(k)) byRef.set(k, []);
      byRef.get(k)!.push(p);
    }
    const nk = normalizeCatalogKey(p.name);
    if (!byNormName.has(nk)) byNormName.set(nk, []);
    byNormName.get(nk)!.push(p);
  }

  // SumUp duplicate item ids
  const sumupIdCounts = new Map<string, number>();
  for (const r of sumup.rows) {
    if (!r.itemId) continue;
    sumupIdCounts.set(r.itemId, (sumupIdCounts.get(r.itemId) || 0) + 1);
  }

  type ProductResult = {
    sumupRow: number;
    sumupName: string;
    sumupProductId: string;
    sumupVariantId: string;
    ean: string;
    category: string;
    sumupPriceCents: number | null;
    status: MatchStatus;
    catalogProductId: string | null;
    catalogName: string | null;
    score: number;
    reason: string;
    candidates: Array<{ id: string; name: string }>;
    priceStatus: PriceStatus | null;
    priceDiffCents: number | null;
    imageStatus: ImageStatus | null;
    applied: boolean;
  };

  const results: ProductResult[] = [];
  const validationQueue: Array<Record<string, unknown>> = [];
  const applyJournal: Array<Record<string, unknown>> = [];
  const usedCatalogForExact = new Set<string>();

  let exactId = 0;
  let exactEan = 0;
  let exactRef = 0;
  let validatedMapping = 0;
  let strictName = 0;
  let review = 0;
  let noMatch = 0;
  let duplicates = 0;
  let conflicts = 0;
  let priceDiffs = 0;
  let appliedCount = 0;

  for (const row of sumup.rows) {
    if (!row.name && !row.itemId) {
      results.push({
        sumupRow: row.rowIndex,
        sumupName: row.name,
        sumupProductId: row.itemId,
        sumupVariantId: row.variantId,
        ean: row.barcode,
        category: row.category,
        sumupPriceCents: row.priceCents,
        status: "NO_MATCH",
        catalogProductId: null,
        catalogName: null,
        score: 0,
        reason: "ligne_invalide_vide",
        candidates: [],
        priceStatus: null,
        priceDiffCents: null,
        imageStatus: null,
        applied: false,
      });
      noMatch += 1;
      continue;
    }

    const ean = normalizeEan(row.barcode);
    let status: MatchStatus = "NO_MATCH";
    let matched: CatalogProduct | null = null;
    let reason = "";
    let score = 0;
    let candidates: CatalogProduct[] = [];

    // 1. Exact SumUp ID
    if (row.itemId && bySumupId.has(row.itemId)) {
      const hits = bySumupId.get(row.itemId)!;
      if (hits.length > 1) {
        status = "DUPLICATE";
        duplicates += 1;
        reason = "plusieurs_produits_catalogue_meme_sumupProductId";
        candidates = hits;
      } else {
        const hit = hits[0];
        const incompat = incompatiblePair(row.name, hit.name);
        if (incompat) {
          status = "CONFLICT";
          conflicts += 1;
          reason = `id_ok_mais_${incompat}`;
          candidates = hits;
        } else {
          status = "MATCH_EXACT_ID";
          exactId += 1;
          matched = hit;
          score = 100;
          reason = "sumupProductId_exact";
        }
      }
    }

    // 2. Exact EAN
    if (!matched && status === "NO_MATCH" && ean && byEan.has(ean)) {
      const hits = byEan.get(ean)!;
      if (hits.length > 1) {
        status = "DUPLICATE";
        duplicates += 1;
        reason = "plusieurs_produits_meme_ean";
        candidates = hits;
      } else {
        const hit = hits[0];
        if (hit.sumupProductId && hit.sumupProductId !== row.itemId && row.itemId) {
          status = "CONFLICT";
          conflicts += 1;
          reason = "ean_ok_mais_sumupProductId_different";
          candidates = hits;
        } else {
          const incompat = incompatiblePair(row.name, hit.name);
          if (incompat) {
            status = "CONFLICT";
            conflicts += 1;
            reason = `ean_ok_mais_${incompat}`;
            candidates = hits;
          } else {
            status = "MATCH_EXACT_EAN";
            exactEan += 1;
            matched = hit;
            score = 95;
            reason = "ean_exact";
          }
        }
      }
    }

    // 3. Exact reference / SKU
    if (!matched && status === "NO_MATCH" && row.sku && byRef.has(row.sku.toLowerCase())) {
      const hits = byRef.get(row.sku.toLowerCase())!;
      if (hits.length === 1) {
        const hit = hits[0];
        const incompat = incompatiblePair(row.name, hit.name);
        if (!incompat && (!hit.sumupProductId || hit.sumupProductId === row.itemId)) {
          status = "MATCH_EXACT_REFERENCE";
          exactRef += 1;
          matched = hit;
          score = 90;
          reason = "reference_sku_exacte";
        } else if (incompat) {
          status = "CONFLICT";
          conflicts += 1;
          reason = `ref_ok_mais_${incompat}`;
          candidates = hits;
        }
      } else if (hits.length > 1) {
        status = "DUPLICATE";
        duplicates += 1;
        reason = "plusieurs_produits_meme_reference";
        candidates = hits;
      }
    }

    // 4. Validated mapping in sumupMapping JSON
    if (!matched && status === "NO_MATCH" && row.itemId) {
      const mapped = catalog.filter((p) => {
        if (!p.sumupMapping) return false;
        try {
          const m = JSON.parse(p.sumupMapping);
          return m?.sumupProductId === row.itemId || m?.itemId === row.itemId || m?.validated === true && m?.sumupId === row.itemId;
        } catch {
          return p.sumupMapping.includes(row.itemId);
        }
      });
      if (mapped.length === 1) {
        status = "MATCH_VALIDATED_MAPPING";
        validatedMapping += 1;
        matched = mapped[0];
        score = 88;
        reason = "mapping_sumup_valide";
      } else if (mapped.length > 1) {
        status = "DUPLICATE";
        duplicates += 1;
        reason = "mapping_multiple";
        candidates = mapped;
      }
    }

    // 5. Strict normalized name
    if (!matched && status === "NO_MATCH") {
      const nk = normalizeCatalogKey(row.name);
      const hits = byNormName.get(nk) || [];
      if (hits.length === 1) {
        const hit = hits[0];
        const incompat = incompatiblePair(row.name, hit.name);
        if (!incompat) {
          if (hit.sumupProductId && row.itemId && hit.sumupProductId !== row.itemId) {
            status = "MATCH_REVIEW_REQUIRED";
            review += 1;
            reason = "nom_strict_mais_sumup_id_different";
            candidates = hits;
            score = 70;
          } else {
            status = "MATCH_STRICT_NAME";
            strictName += 1;
            matched = hit;
            score = 75;
            reason = "nom_normalise_strict";
            // do not auto-apply name-only
          }
        } else {
          status = "MATCH_REVIEW_REQUIRED";
          review += 1;
          reason = `nom_proche_mais_${incompat}`;
          candidates = hits;
          score = 40;
        }
      } else if (hits.length > 1) {
        status = "MATCH_REVIEW_REQUIRED";
        review += 1;
        reason = "plusieurs_noms_stricts";
        candidates = hits;
        score = 50;
      } else {
        // fuzzy candidates for review: same first tokens
        const tokens = nk.split(/\s+/).filter((t) => t.length > 3).slice(0, 4);
        if (tokens.length >= 2) {
          const fuzzy = catalog
            .filter((p) => {
              const pn = normalizeCatalogKey(p.name);
              return tokens.every((t) => pn.includes(t));
            })
            .slice(0, 5);
          if (fuzzy.length) {
            status = "MATCH_REVIEW_REQUIRED";
            review += 1;
            reason = "candidats_partiels_a_verifier";
            candidates = fuzzy;
            score = 35;
          } else {
            status = "NO_MATCH";
            noMatch += 1;
            reason = "aucune_correspondance";
          }
        } else {
          status = "NO_MATCH";
          noMatch += 1;
          reason = "aucune_correspondance";
        }
      }
    }

    let priceStatus: PriceStatus | null = null;
    let priceDiff: number | null = null;
    let imageStatus: ImageStatus | null = null;

    if (matched) {
      if (row.priceCents == null) priceStatus = "MANQUANT_SUMUP";
      else if (matched.priceCents == null || matched.priceCents === 0) priceStatus = "MANQUANT_CATALOGUE";
      else if (row.priceCents === matched.priceCents) priceStatus = "IDENTIQUE";
      else {
        priceStatus = "DIFFÉRENT";
        priceDiff = row.priceCents - matched.priceCents;
        priceDiffs += 1;
      }
      imageStatus = classifyImage(matched);
    }

    let applied = false;
    // APPLY : UNIQUEMENT MATCH_EXACT_EAN, sans conflit, sans écraser un sumupProductId existant
    const canApply =
      APPLY_EXACT &&
      matched &&
      status === "MATCH_EXACT_EAN" &&
      Boolean(row.itemId) &&
      Boolean(normalizeEan(row.barcode)) &&
      !matched.sumupProductId &&
      !usedCatalogForExact.has(matched.id);

    if (canApply && matched) {
      // Ne remplit que sumupProductId manquant (+ sumupName/sku si vides). Jamais prix/stock/barcode déjà présent.
      // Ne remplace JAMAIS un sumupProductId existant.
      const data: {
        sumupProductId?: string;
        sumupName?: string;
        sumupSku?: string;
        sumupLastSync?: Date;
      } = {};
      data.sumupProductId = row.itemId;
      if (!matched.sumupName && row.name) data.sumupName = row.name;
      if (!matched.sumupSku && row.sku) data.sumupSku = row.sku;
      data.sumupLastSync = new Date();

      // Garde-fou : si un autre produit a déjà cet ID → refus
      const conflictId = await prisma.product.findFirst({
        where: {
          sumupProductId: row.itemId,
          id: { not: matched.id },
        },
        select: { id: true, name: true },
      });
      if (conflictId) {
        applyJournal.push({
          at: new Date().toISOString(),
          refused: true,
          reason: "sumupProductId_deja_utilise",
          catalogId: matched.id,
          catalogName: matched.name,
          sumupItemId: row.itemId,
          conflictWith: conflictId,
        });
      } else {
        await prisma.product.update({
          where: { id: matched.id },
          data: {
            sumupProductId: data.sumupProductId,
            ...(data.sumupName ? { sumupName: data.sumupName } : {}),
            ...(data.sumupSku ? { sumupSku: data.sumupSku } : {}),
            sumupLastSync: data.sumupLastSync,
          },
        });
        applied = true;
        appliedCount += 1;
        usedCatalogForExact.add(matched.id);
        applyJournal.push({
          at: new Date().toISOString(),
          catalogId: matched.id,
          catalogName: matched.name,
          status: "MATCH_EXACT_EAN",
          before: {
            sumupProductId: matched.sumupProductId,
            barcode: matched.barcode,
            priceCents: matched.priceCents,
            stock: matched.stock,
          },
          after: {
            sumupProductId: data.sumupProductId,
            sumupName: data.sumupName ?? null,
            sumupSku: data.sumupSku ?? null,
          },
          sumupItemId: row.itemId,
          ean: row.barcode,
          priceChanged: false,
          stockChanged: false,
          barcodeChanged: false,
        });
      }
    } else if (
      APPLY_EXACT &&
      matched &&
      status === "MATCH_EXACT_EAN" &&
      matched.sumupProductId
    ) {
      applyJournal.push({
        at: new Date().toISOString(),
        refused: true,
        reason: matched.sumupProductId === row.itemId
          ? "sumupProductId_deja_identique"
          : "sumupProductId_existant_non_ecrase",
        catalogId: matched.id,
        catalogName: matched.name,
        existingSumupProductId: matched.sumupProductId,
        sumupItemId: row.itemId,
      });
    }

    if (
      status === "MATCH_REVIEW_REQUIRED" ||
      status === "CONFLICT" ||
      status === "DUPLICATE" ||
      status === "MATCH_STRICT_NAME"
    ) {
      validationQueue.push({
        nomSumUp: row.name,
        identifiantSumUp: row.itemId,
        ean: row.barcode,
        categorie: row.category,
        produitCatalogueCandidat: (matched || candidates[0])?.name ?? null,
        candidats: (matched ? [matched] : candidates).map((c) => ({
          id: c.id,
          name: c.name,
          sumupProductId: c.sumupProductId,
        })),
        scoreCorrespondance: score,
        raisonBlocage: reason,
        statut: status,
        actionProposee:
          status === "MATCH_STRICT_NAME"
            ? "valider_manuellement_avant_liaison_sumup"
            : "revue_humaine_obligatoire",
        validationRequise: true,
      });
    }

    results.push({
      sumupRow: row.rowIndex,
      sumupName: row.name,
      sumupProductId: row.itemId,
      sumupVariantId: row.variantId,
      ean: row.barcode,
      category: row.category,
      sumupPriceCents: row.priceCents,
      status,
      catalogProductId: matched?.id ?? null,
      catalogName: matched?.name ?? null,
      score,
      reason,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
      priceStatus,
      priceDiffCents: priceDiff,
      imageStatus,
      applied,
    });
  }

  // Catalog without SumUp
  const catalogWithoutSumup = catalog.filter((p) => !p.sumupProductId);
  const sumupIds = new Set(sumup.rows.map((r) => r.itemId).filter(Boolean));
  const sumupNoCatalog = results.filter((r) => r.status === "NO_MATCH");

  // AVA missing for magasin-active products
  const avaCsvIds = new Set<string>();
  if (fs.existsSync(AVA_CSV)) {
    const ava = parseCsv(fs.readFileSync(AVA_CSV, "utf8"), ";");
    for (const r of ava.rows) {
      const id = r.id_produit || r["id_produit"];
      if (id) avaCsvIds.add(id);
    }
  }
  const missingAva = catalog.filter(
    (p) => p.isActive && !p.hasAvaMeta && !avaCsvIds.has(p.id),
  );
  const avaQueue = missingAva.map((p) => ({
    id_produit: p.id,
    nom: p.name,
    fabricant: p.manufacturerSlug,
    gamme: p.rangeSlug,
    saveurs_connues: [],
    informations_manquantes: ["profil_ava", "saveurs", "description_ava"],
    source: "audit-sumup-catalogue",
    statut_verification: "À VÉRIFIER",
  }));

  // Image report
  const imageIssues = catalog
    .filter((p) => p.isActive)
    .map((p) => ({ product: p, status: classifyImage(p) }))
    .filter((x) => x.status !== "IMAGE_OK");

  // CSV stats
  const uniqueItemIds = new Set(sumup.rows.map((r) => r.itemId).filter(Boolean));
  const withEan = sumup.rows.filter((r) => normalizeEan(r.barcode)).length;
  const withoutEan = sumup.rows.length - withEan;
  const categories = new Set(sumup.rows.map((r) => r.category).filter(Boolean));
  const variantRows = sumup.rows.filter((r) => r.variantId).length;
  const invalidRows = sumup.rows.filter((r) => !r.name || !r.itemId).length;
  const dupItemIds = [...sumupIdCounts.entries()].filter(([, n]) => n > 1);

  // SumUp absent proposals
  const sumupAbsent = sumupNoCatalog.slice(0, 500).map((r) => {
    const name = r.sumupName;
    return {
      sumupProductId: r.sumupProductId,
      ean: r.ean,
      nomCaisse: name,
      categorieSumUp: r.category,
      fabricantProbable: "À VÉRIFIER",
      gammeProbable: "À VÉRIFIER",
      formatProbable: extractVolume(name) ? `${extractVolume(name)} ml` : "À VÉRIFIER",
      nicotineProbable: extractNicotine(name) != null ? `${extractNicotine(name)} mg` : "À VÉRIFIER",
      statutVerification: "À VÉRIFIER",
      donneesManquantes: ["fabricant", "gamme", "image_officielle", "fiche_catalogue"],
      nePasPublier: true,
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(REBUILD, { recursive: true });

  // JSON structured
  const jsonReport = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_EXACT ? "APPLY_EXACT_ONLY" : "DRY_RUN",
    csvPath,
    zipFound: zipFound || null,
    sumupRows: sumup.rows.length,
    sumupProducts: uniqueItemIds.size,
    catalogProducts: catalog.length,
    exactIdMatches: exactId,
    exactEanMatches: exactEan,
    exactReferenceMatches: exactRef,
    validatedMappingMatches: validatedMapping,
    strictNameMatches: strictName,
    reviewRequired: review,
    noMatch: noMatch,
    duplicates,
    conflicts,
    missingImages: imageIssues.filter((i) => i.status === "IMAGE_MISSING").length,
    missingAvaProfiles: missingAva.length,
    catalogWithoutSumup: catalogWithoutSumup.length,
    priceDifferences: priceDiffs,
    pricesModified: 0,
    stocksModified: 0,
    productsDeleted: 0,
    appliedExactUpdates: appliedCount,
    encoding: sumup.encoding,
    separator: sumup.separator,
    products: results,
  };
  write(path.join(REBUILD, "RAPPORT_RAPPROCHEMENT_SUMUP_CATALOGUE.json"), JSON.stringify(jsonReport, null, 2));
  write(path.join(REBUILD, "QUEUE_VALIDATION_SUMUP.json"), JSON.stringify(validationQueue, null, 2));
  write(path.join(REBUILD, "QUEUE_PROFILS_AVA_MANQUANTS.json"), JSON.stringify(avaQueue, null, 2));
  if (APPLY_EXACT) {
    write(JOURNAL, JSON.stringify(applyJournal, null, 2));
  }

  // MD reports
  write(
    path.join(OUT_DIR, "AUDIT_CSV_SUMUP_2026-08-03.md"),
    `# AUDIT CSV SumUp — 2026-08-03

**Fichier :** \`${path.basename(csvPath)}\`  
**Encodage :** ${sumup.encoding}  
**Séparateur :** \`${sumup.separator}\`  
**ZIP catalogue-allvaps.zip :** ${zipFound ? `trouvé (${zipFound})` : "**non trouvé** — audit basé sur le projet courant + CSV Downloads"}

## Chiffres

| Indicateur | Valeur |
|---|---:|
| Lignes totales | ${sumup.rows.length} |
| Produits uniques (Item id) | ${uniqueItemIds.size} |
| Lignes avec Variant id | ${variantRows} |
| Avec Item id | ${sumup.rows.filter((r) => r.itemId).length} |
| Avec EAN / Barcode | ${withEan} |
| Sans EAN | ${withoutEan} |
| Catégories | ${categories.size} |
| Item id en doublon (lignes) | ${dupItemIds.length} |
| Lignes invalides (sans nom ou id) | ${invalidRows} |

## Colonnes détectées

${sumup.headers.map((h) => `- \`${h}\``).join("\n")}

## Doublons Item id (extrait)

${dupItemIds
  .slice(0, 30)
  .map(([id, n]) => `- \`${id}\` × ${n}`)
  .join("\n") || "_aucun_"}

## Notes

- Aucune donnée modifiée dans cette étape d’audit CSV.
- Prix lus pour contrôle uniquement.
`,
  );

  write(
    path.join(OUT_DIR, "RAPPROCHEMENT_SUMUP_CATALOGUE.md"),
    `# Rapprochement SumUp ↔ Catalogue

**Mode :** ${APPLY_EXACT ? "APPLY_EXACT_ONLY" : "DRY-RUN"}  
**Source catalogue :** Prisma \`Product\` (site) + CSV magasin/AVA pour contrôles

## Synthèse

| Statut | Nombre |
|---|---:|
| MATCH_EXACT_ID | ${exactId} |
| MATCH_EXACT_EAN | ${exactEan} |
| MATCH_EXACT_REFERENCE | ${exactRef} |
| MATCH_VALIDATED_MAPPING | ${validatedMapping} |
| MATCH_STRICT_NAME | ${strictName} |
| MATCH_REVIEW_REQUIRED | ${review} |
| NO_MATCH | ${noMatch} |
| DUPLICATE | ${duplicates} |
| CONFLICT | ${conflicts} |
| Modifications appliquées | ${appliedCount} |
| Prix modifiés | 0 |
| Stocks modifiés | 0 |

## Ordre de rapprochement

1. sumupProductId exact  
2. EAN exact  
3. référence / SKU exact  
4. mapping SumUp validé  
5. nom normalisé strict  
6. revue manuelle  

Fichier JSON : \`data/rebuild/RAPPORT_RAPPROCHEMENT_SUMUP_CATALOGUE.json\`  
File validation : \`data/rebuild/QUEUE_VALIDATION_SUMUP.json\`
`,
  );

  write(
    path.join(OUT_DIR, "PRODUITS_SUMUP_SANS_CATALOGUE.md"),
    `# Produits SumUp sans catalogue

**Nombre :** ${sumupAbsent.length} (NO_MATCH)

Ces fiches ne doivent **pas** être publiées automatiquement. Toute hypothèse = **À VÉRIFIER**.

| SumUp ID | EAN | Nom caisse | Catégorie | Format? | Nicotine? |
|---|---|---|---|---|---|
${sumupAbsent
  .slice(0, 200)
  .map(
    (p) =>
      `| \`${p.sumupProductId}\` | ${p.ean || "—"} | ${p.nomCaisse.replace(/\|/g, "/")} | ${p.categorieSumUp || "—"} | ${p.formatProbable} | ${p.nicotineProbable} |`,
  )
  .join("\n")}

${sumupAbsent.length > 200 ? `\n_… ${sumupAbsent.length - 200} autres dans le JSON de rapprochement._\n` : ""}
`,
  );

  write(
    path.join(OUT_DIR, "PRODUITS_CATALOGUE_SANS_SUMUP.md"),
    `# Produits catalogue sans SumUp

**Nombre :** ${catalogWithoutSumup.length}

Aucune suppression. Séparation indicative :

## Actifs / potentiellement vendus

${catalogWithoutSumup
  .filter((p) => p.isActive)
  .slice(0, 150)
  .map(
    (p) =>
      `- **${p.name}** (\`${p.id}\`) · ${p.manufacturerSlug || "—"} / ${p.rangeSlug || "—"} · visible=${p.visibleOnline} · status=${p.catalogStatus}`,
  )
  .join("\n") || "_aucun_"}

## Inactifs / brouillons

${catalogWithoutSumup
  .filter((p) => !p.isActive)
  .slice(0, 80)
  .map((p) => `- ${p.name} (\`${p.id}\`) · ${p.catalogStatus}`)
  .join("\n") || "_aucun_"}
`,
  );

  write(
    path.join(OUT_DIR, "IMAGES_PRODUITS_A_CONTROLER.md"),
    `# Images produits à contrôler

**Produits actifs avec image non OK :** ${imageIssues.length}

| Statut | Nb |
|---|---:|
${Object.entries(
  imageIssues.reduce(
    (acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  ),
)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}

## Extrait

${imageIssues
  .slice(0, 120)
  .map(
    (i) =>
      `- **${i.product.name}** — \`${i.status}\` · ${i.product.imageUrl || "sans image"} · mfr=${i.product.manufacturerSlug || "—"}`,
  )
  .join("\n")}
`,
  );

  write(
    path.join(OUT_DIR, "PROFILS_AVA_MANQUANTS.md"),
    `# Profils A.V.A. manquants

**Nombre :** ${missingAva.length}

File : \`data/rebuild/QUEUE_PROFILS_AVA_MANQUANTS.json\`

Aucun profil existant modifié.

${missingAva
  .slice(0, 120)
  .map((p) => `- **${p.name}** (\`${p.id}\`) · ${p.manufacturerSlug || "—"} / ${p.rangeSlug || "—"}`)
  .join("\n") || "_aucun_"}
`,
  );

  write(
    path.join(OUT_DIR, "DIFFERENCES_PRIX_SUMUP_CATALOGUE.md"),
    `# Différences de prix SumUp ↔ Catalogue

**IMPORTANT :** aucune correction de prix appliquée dans cette mission.

**Correspondances avec écart de prix :** ${priceDiffs}

| Produit catalogue | Prix catalogue (€) | Prix SumUp (€) | Diff (cents) | Statut |
|---|---:|---:|---:|---|
${results
  .filter((r) => r.priceStatus === "DIFFÉRENT")
  .slice(0, 150)
  .map((r) => {
    const cat = catalog.find((c) => c.id === r.catalogProductId);
    return `| ${(r.catalogName || "").replace(/\|/g, "/")} | ${cat ? (cat.priceCents / 100).toFixed(2) : "—"} | ${r.sumupPriceCents != null ? (r.sumupPriceCents / 100).toFixed(2) : "—"} | ${r.priceDiffCents} | DIFFÉRENT |`;
  })
  .join("\n") || "_aucune différence sur les matchs_"}
`,
  );

  // Final state phrase
  const warnings =
    review + conflicts + duplicates + sumupAbsent.length + imageIssues.length + missingAva.length;
  const finalState =
    conflicts > 50
      ? "❌ ÉTAT FINAL : AVEC ERREURS"
      : warnings > 0
        ? "⚠️ ÉTAT FINAL : OK AVEC AVERTISSEMENTS"
        : "✅ ÉTAT FINAL : OK";

  console.log(
    JSON.stringify(
      {
        mode: APPLY_EXACT ? "APPLY_EXACT_ONLY" : "DRY_RUN",
        csvPath,
        zipFound: zipFound || null,
        sumupRows: sumup.rows.length,
        sumupProductsUnique: uniqueItemIds.size,
        catalogProducts: catalog.length,
        exactIdMatches: exactId,
        exactEanMatches: exactEan,
        exactReferenceMatches: exactRef,
        reviewRequired: review,
        sumupWithoutCatalog: noMatch,
        catalogWithoutSumup: catalogWithoutSumup.length,
        conflicts,
        duplicates,
        missingImages: imageIssues.filter((i) => i.status === "IMAGE_MISSING").length,
        missingAvaProfiles: missingAva.length,
        priceDifferences: priceDiffs,
        pricesModified: 0,
        stocksModified: 0,
        productsDeleted: 0,
        appliedExactUpdates: appliedCount,
        modificationsPrevuesExactOnly: results.filter(
          (r) =>
            (r.status === "MATCH_EXACT_EAN" ||
              r.status === "MATCH_EXACT_REFERENCE" ||
              r.status === "MATCH_VALIDATED_MAPPING") &&
            r.catalogProductId,
        ).length,
        modificationsAppliquees: appliedCount,
        finalState,
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
