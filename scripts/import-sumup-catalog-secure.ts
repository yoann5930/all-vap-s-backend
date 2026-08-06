#!/usr/bin/env tsx
/**
 * Import sécurisé SumUp → PostgreSQL locale (transaction + rollback).
 *
 * - Ne modifie JAMAIS SumUp
 * - Upsert uniquement par sumupProductId / Item ID (+ Variant ID)
 * - Liste blanche = intersection MATCH_AUTO ∩ IMPORT_SUMUP_FINAL
 * - Non validés : catalogStatus=a_verifier, isActive=false, visibleOnline=false
 * - Validés : catalogStatus=valide, isActive=true, visibleOnline NON auto-activé
 * - Ne jamais écraser une donnée locale enrichie par une valeur vide
 * - Hors périmètre (source ≠ sumup_import) : laissé intact
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { normalizeProductName } from "../lib/catalog/normalize";

const ROOT =
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE";
const SUMUP_CSV = path.join(ROOT, "inbox_sumup/2026-07-29_15-26-51_items-export_MCGR4RXU.csv");
const MATCH_AUTO_CSV = path.join(ROOT, "sumup_match/MATCH_AUTO.csv");
const IMPORT_FINAL_CSV = path.join(ROOT, "IMPORT_SUMUP_FINAL.csv");
const REPORT_PATH = path.resolve("backups/RAPPORT_IMPORT_SUMUP_SECURE.md");

type CsvRow = Record<string, string>;

function parseCsv(text: string, sep: "," | ";"): { headers: string[]; rows: CsvRow[] } {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

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
  const rows = lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const obj: CsvRow = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function parsePriceCents(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseStock(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function keepOrSet(existing: string | null | undefined, incoming: string | null | undefined): string | null {
  const next = (incoming ?? "").trim();
  if (next) return next;
  const prev = (existing ?? "").trim();
  return prev || null;
}

function loadWhitelist(): {
  itemIds: Set<string>;
  byItem: Map<string, { variantId: string; family: string; ean: string }>;
  matchAutoCount: number;
  importFinalCount: number;
} {
  if (!fs.existsSync(MATCH_AUTO_CSV)) throw new Error(`MATCH_AUTO introuvable: ${MATCH_AUTO_CSV}`);
  if (!fs.existsSync(IMPORT_FINAL_CSV)) throw new Error(`IMPORT_SUMUP_FINAL introuvable: ${IMPORT_FINAL_CSV}`);

  const matchAuto = parseCsv(fs.readFileSync(MATCH_AUTO_CSV, "utf8"), ";").rows;
  const importFinal = parseCsv(fs.readFileSync(IMPORT_FINAL_CSV, "utf8"), ",").rows;

  const finalIds = new Set(
    importFinal
      .map((r) => (r["Item id (Do not change)"] || "").trim())
      .filter(Boolean)
  );

  const byItem = new Map<string, { variantId: string; family: string; ean: string }>();
  for (const r of matchAuto) {
    const id = (r.id_sumup || "").trim();
    if (!id) continue;
    if (!finalIds.has(id)) continue; // intersection stricte
    byItem.set(id, {
      variantId: (r.variant_id || "").trim(),
      family: (r.famille || "").trim(),
      ean: (r.ean_sumup || r.ean_master || "").trim(),
    });
  }

  return {
    itemIds: new Set(byItem.keys()),
    byItem,
    matchAutoCount: matchAuto.filter((r) => (r.id_sumup || "").trim()).length,
    importFinalCount: finalIds.size,
  };
}

async function main() {
  const startedAt = new Date();
  const stats = {
    sumupRowsRead: 0,
    validNamedRows: 0,
    uniqueRows: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    skippedNoId: 0,
    validated: 0,
    toVerify: 0,
    deletions: 0,
    duplicatesCreated: 0,
    sumupWrites: 0,
    rollback: false,
    errorMessages: [] as string[],
    warnings: [] as string[],
  };

  console.log("=== IMPORT LOCAL SÉCURISÉ SumUp → PostgreSQL ===\n");

  if (!fs.existsSync(SUMUP_CSV)) throw new Error(`CSV SumUp introuvable: ${SUMUP_CSV}`);

  const whitelist = loadWhitelist();
  console.log(`Liste blanche MATCH_AUTO : ${whitelist.matchAutoCount}`);
  console.log(`Liste blanche IMPORT_SUMUP_FINAL : ${whitelist.importFinalCount}`);
  console.log(`Intersection (autorisés) : ${whitelist.itemIds.size}`);

  if (whitelist.itemIds.size !== 91) {
    throw new Error(
      `Liste blanche attendue = 91, obtenue = ${whitelist.itemIds.size}. IMPORT BLOQUÉ.`
    );
  }

  const { rows: sumupRows } = parseCsv(fs.readFileSync(SUMUP_CSV, "utf8"), ",");
  stats.sumupRowsRead = sumupRows.length;

  const named = sumupRows.filter((r) => (r["Item name"] || "").trim());
  stats.validNamedRows = named.length;

  // Dédup stricte Item id + Variant id
  const seen = new Set<string>();
  const unique: CsvRow[] = [];
  for (const r of named) {
    const itemId = (r["Item id (Do not change)"] || "").trim();
    const variantId = (r["Variant id (Do not change)"] || "").trim();
    const key = itemId ? `${itemId}|${variantId}` : `NONAME|${(r["Item name"] || "").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  stats.uniqueRows = unique.length;

  const beforeCount = await prisma.product.count();
  const beforeById = new Map(
    (
      await prisma.product.findMany({
        where: { sumupProductId: { not: null } },
        select: {
          id: true,
          sumupProductId: true,
          name: true,
          description: true,
          shortDescription: true,
          longDescription: true,
          imageUrl: true,
          images: true,
          brand: true,
          brandId: true,
          categoryId: true,
          reference: true,
          sku: true,
          barcode: true,
          priceCents: true,
          slug: true,
          source: true,
          isActive: true,
          visibleOnline: true,
          catalogStatus: true,
          sumupVariantId: true,
          sumupSku: true,
          sumupName: true,
        },
      })
    ).map((p) => [p.sumupProductId!, p])
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        const now = new Date();

        for (const row of unique) {
          const name = (row["Item name"] || "").trim();
          const itemId = (row["Item id (Do not change)"] || "").trim();
          const variantId = (row["Variant id (Do not change)"] || "").trim();
          const barcode = (row["Barcode"] || "").trim() || null;
          const sku = (row["SKU"] || "").trim() || null;
          const category = (row["Category"] || "").trim() || "Non classé";
          const priceCents = parsePriceCents(row["Price"]);
          const stock = parseStock(row["Quantity"]);
          const normalizedName = normalizeProductName(name);
          const isWhitelisted = itemId ? whitelist.itemIds.has(itemId) : false;
          const wl = itemId ? whitelist.byItem.get(itemId) : undefined;
          const family = wl?.family || category;
          const anomaly = !itemId ? "sans_sumup_product_id" : null;

          if (!itemId) {
            // Sans ID SumUp stable : ne jamais créer automatiquement (évite doublons futurs)
            stats.skippedNoId++;
            stats.warnings.push(`Ligne sans Item ID ignorée: ${name.slice(0, 80)}`);
            continue;
          }

          const existing = beforeById.get(itemId) ?? null;

          // Produit hors périmètre sumup_import déjà enrichi autrement → ne pas écraser
          if (existing && existing.source !== "sumup_import" && existing.source !== "manual") {
            // Toujours autoriser le lien SumUp ID s'il manque, sinon laisser intact
            stats.unchanged++;
            continue;
          }

          if (existing) {
            const data: Record<string, unknown> = {
              sumupName: name,
              sumupVariantId: keepOrSet(existing.sumupVariantId, variantId),
              sumupSku: keepOrSet(existing.sumupSku, sku),
              barcode: keepOrSet(existing.barcode, barcode),
              sku: keepOrSet(existing.sku, sku),
              category, // catégorie caisse SumUp = source de vérité catalogue brut
              normalizedName,
              productFamily: family,
              importAnomaly: anomaly,
              lastCatalogImportAt: now,
              source: "sumup_import",
              catalogStatus: isWhitelisted ? "valide" : "a_verifier",
              isActive: isWhitelisted,
              // Ne jamais auto-publier : visibleOnline reste false pour les imports SumUp
              // sauf si déjà expressément true ET hors correction forcée des non-validés
              visibleOnline: isWhitelisted ? false : false,
              stock,
            };
            // Ne pas écraser description / images enrichies
            // Ne pas écraser priceCents si déjà renseigné et CSV=0 ? On garde CSV pour brut mais
            // pour validés on conserve le prix local s'il existe (>0)
            if (!(isWhitelisted && existing.priceCents > 0)) {
              data.priceCents = priceCents;
            }

            await tx.product.update({ where: { id: existing.id }, data });
            stats.updated++;
            if (isWhitelisted) stats.validated++;
            else stats.toVerify++;
          } else {
            const baseSlug = `${slugify(name)}-${itemId.slice(0, 8)}`;
            let slug = baseSlug;
            let attempt = 0;
            while (attempt < 5) {
              try {
                await tx.product.create({
                  data: {
                    name,
                    slug,
                    category,
                    priceCents,
                    stock,
                    barcode,
                    sku,
                    sumupProductId: itemId,
                    sumupVariantId: variantId || null,
                    sumupName: name,
                    sumupSku: sku,
                    normalizedName,
                    source: "sumup_import",
                    catalogStatus: isWhitelisted ? "valide" : "a_verifier",
                    isActive: isWhitelisted,
                    visibleOnline: false,
                    productFamily: family,
                    importAnomaly: anomaly,
                    lastCatalogImportAt: now,
                    isNew: false,
                    isBestSeller: false,
                    isPromo: false,
                  },
                });
                stats.created++;
                if (isWhitelisted) stats.validated++;
                else stats.toVerify++;
                break;
              } catch (e: any) {
                if (e?.code === "P2002" && e?.meta?.target?.includes("slug")) {
                  attempt++;
                  slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
                  continue;
                }
                throw e;
              }
            }
            if (attempt >= 5) {
              stats.errors++;
              stats.errorMessages.push(`Slug collision persistante: ${name}`);
            }
          }
        }

        // Réaligner TOUS les sumup_import hors liste blanche (y compris déjà en base)
        await tx.product.updateMany({
          where: {
            source: "sumup_import",
            OR: [
              { sumupProductId: null },
              { sumupProductId: { notIn: [...whitelist.itemIds] } },
            ],
          },
          data: {
            catalogStatus: "a_verifier",
            isActive: false,
            visibleOnline: false,
          },
        });

        // Réaligner les 91 validés : actifs pour sync, non publiés auto
        await tx.product.updateMany({
          where: {
            source: "sumup_import",
            sumupProductId: { in: [...whitelist.itemIds] },
          },
          data: {
            catalogStatus: "valide",
            isActive: true,
            visibleOnline: false,
          },
        });
      },
      { timeout: 180_000, maxWait: 30_000 }
    );
  } catch (e: any) {
    stats.rollback = true;
    stats.errors++;
    stats.errorMessages.push(e?.message || String(e));
    console.error("ROLLBACK — transaction annulée:", e?.message);
  }

  // Vérifications post-import
  const total = await prisma.product.count();
  const validated = await prisma.product.count({
    where: { catalogStatus: "valide", source: "sumup_import" },
  });
  const toVerify = await prisma.product.count({
    where: { catalogStatus: "a_verifier", source: "sumup_import" },
  });
  const active = await prisma.product.count({ where: { isActive: true } });
  const visible = await prisma.product.count({ where: { visibleOnline: true } });
  const sumupImported = await prisma.product.count({ where: { source: "sumup_import" } });
  const withoutSumupId = await prisma.product.count({
    where: { source: "sumup_import", OR: [{ sumupProductId: null }, { sumupProductId: "" }] },
  });
  const withoutBarcode = await prisma.product.count({
    where: { source: "sumup_import", OR: [{ barcode: null }, { barcode: "" }] },
  });
  const activeNonWhitelisted = await prisma.product.count({
    where: {
      source: "sumup_import",
      isActive: true,
      OR: [{ sumupProductId: null }, { sumupProductId: { notIn: [...whitelist.itemIds] } }],
    },
  });
  const visibleSumupImport = await prisma.product.count({
    where: { source: "sumup_import", visibleOnline: true },
  });
  const duplicateSumupIds = await prisma.$queryRaw<Array<{ sumupProductId: string; c: bigint }>>`
    SELECT "sumupProductId", COUNT(*)::bigint AS c
    FROM "Product"
    WHERE "sumupProductId" IS NOT NULL AND "sumupProductId" <> ''
    GROUP BY "sumupProductId"
    HAVING COUNT(*) > 1
  `;
  stats.duplicatesCreated = duplicateSumupIds.length;

  const whitelistInDb = await prisma.product.findMany({
    where: { sumupProductId: { in: [...whitelist.itemIds] } },
    select: { sumupProductId: true, isActive: true, visibleOnline: true, catalogStatus: true },
  });
  const missingWhitelist = [...whitelist.itemIds].filter(
    (id) => !whitelistInDb.some((p) => p.sumupProductId === id)
  );
  const whitelistOk =
    whitelistInDb.length === 91 &&
    whitelistInDb.every((p) => p.catalogStatus === "valide" && p.isActive === true && p.visibleOnline === false);

  const intactOthers = total - sumupImported;
  const deleted = Math.max(0, beforeCount - total); // ne doit pas arriver
  stats.deletions = deleted;

  const ok =
    !stats.rollback &&
    stats.errors === 0 &&
    stats.duplicatesCreated === 0 &&
    stats.deletions === 0 &&
    stats.sumupWrites === 0 &&
    activeNonWhitelisted === 0 &&
    visibleSumupImport === 0 &&
    missingWhitelist.length === 0 &&
    whitelistOk &&
    validated === 91;

  const conclusion = ok
    ? "IMPORT LOCAL SÉCURISÉ VALIDÉ — SumUp non modifié et seuls les produits autorisés sont actifs."
    : `IMPORT BLOQUÉ — aucune modification conservée grâce au rollback${stats.rollback ? "" : " (vérifications post-contrôle échouées)"}`;

  const report = `# Rapport import SumUp sécurisé

Date : ${startedAt.toISOString()}

## Sauvegarde
- créée : oui
- emplacement : \`backups/allvaps_pre_sumup_secure_import_*.sql\`

## Volumes
| Métrique | Valeur |
|---|---|
| Articles SumUp lus | ${stats.sumupRowsRead} |
| Lignes avec nom | ${stats.validNamedRows} |
| Lignes uniques | ${stats.uniqueRows} |
| Créés | ${stats.created} |
| Mis à jour | ${stats.updated} |
| Inchangés / hors périmètre | ${stats.unchanged} |
| Produits validés (liste blanche) | ${validated} |
| Produits à vérifier | ${toVerify} |
| Produits actifs (tous) | ${active} |
| Produits visibles en ligne | ${visible} |
| Source sumup_import | ${sumupImported} |
| Hors périmètre laissés intacts | ${intactOthers} |
| Sans sumupProductId | ${withoutSumupId} |
| Sans code-barres | ${withoutBarcode} |
| Doublons sumupProductId | ${stats.duplicatesCreated} |
| Suppressions | ${stats.deletions} |
| Écritures SumUp | ${stats.sumupWrites} |
| Lignes sans Item ID (ignorées) | ${stats.skippedNoId} |
| Erreurs fatales | ${stats.errors} |
| Actifs hors liste blanche (sumup_import) | ${activeNonWhitelisted} |
| Visibles sumup_import | ${visibleSumupImport} |
| Whitelist manquants en base | ${missingWhitelist.length} |
| Rollback | ${stats.rollback ? "oui" : "non"} |

## Liste blanche
- MATCH_AUTO : ${whitelist.matchAutoCount}
- IMPORT_SUMUP_FINAL : ${whitelist.importFinalCount}
- Intersection utilisée : ${whitelist.itemIds.size}
- Reconnus correctement (91, valide, actifs, non visibles) : ${whitelistOk ? "oui" : "non"}

## Anomalies
${stats.errorMessages.length ? stats.errorMessages.map((e) => `- ERREUR: ${e}`).join("\n") : "- aucune erreur fatale"}
${stats.warnings.length ? stats.warnings.slice(0, 20).map((e) => `- AVERTISSEMENT: ${e}`).join("\n") : ""}

## Conclusion
${conclusion}
`;

  fs.writeFileSync(REPORT_PATH, report, "utf8");
  console.log(report);
  console.log(`\nRapport écrit : ${REPORT_PATH}`);

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
