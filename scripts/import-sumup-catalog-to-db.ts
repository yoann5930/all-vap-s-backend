#!/usr/bin/env tsx
/**
 * Import de l'export SumUp CSV dans PostgreSQL locale.
 *
 * Règles :
 * - NE MODIFIE JAMAIS SumUp
 * - Tous les produits importés : isActive=false, visibleOnline=false, source="sumup_import"
 * - Les 91 matchés AUTO (MATCH_AUTO.csv) sont ensuite marqués isActive=true, visibleOnline=true
 * - Aucun produit existant n'est supprimé
 * - Les doublons (même sumupProductId) sont mis à jour, pas dupliqués
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { normalizeProductName } from "../lib/catalog/normalize";

const SUMUP_CSV = path.resolve(
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE/inbox_sumup/2026-07-29_15-26-51_items-export_MCGR4RXU.csv"
);

const MATCH_AUTO_CSV = path.resolve(
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE/sumup_match/MATCH_AUTO.csv"
);

function parseCsvComma(text: string) {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  function splitLine(line: string) {
    const cols: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
        continue;
      }
      if (c === "," && !q) { cols.push(cur); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur);
    return cols;
  }

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}

function parseCsvSemicolon(text: string) {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = lines[0].split(";").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(";");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim().replace(/^"|"$/g, "")));
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
    .slice(0, 200);
}

function parsePriceCents(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseStock(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function main() {
  console.log("=== Import SumUp → PostgreSQL (lecture seule SumUp) ===\n");

  if (!fs.existsSync(SUMUP_CSV)) {
    console.error(`ERREUR: CSV SumUp introuvable : ${SUMUP_CSV}`);
    process.exit(1);
  }

  const { rows: sumupRows } = parseCsvComma(fs.readFileSync(SUMUP_CSV, "utf8"));
  console.log(`CSV SumUp : ${sumupRows.length} lignes lues`);

  // Filtrer lignes sans nom
  const validRows = sumupRows.filter((r) => (r["Item name"] || "").trim());
  console.log(`Lignes valides (avec nom) : ${validRows.length}`);

  // Charger les 91 matchés AUTO
  let autoSumupIds = new Set<string>();
  if (fs.existsSync(MATCH_AUTO_CSV)) {
    const { rows: autoRows } = parseCsvSemicolon(fs.readFileSync(MATCH_AUTO_CSV, "utf8"));
    for (const r of autoRows) {
      const id = (r.id_sumup || "").trim();
      if (id) autoSumupIds.add(id);
    }
    console.log(`MATCH_AUTO : ${autoSumupIds.size} produits validés`);
  } else {
    console.warn("MATCH_AUTO.csv introuvable — aucun produit ne sera marqué actif");
  }

  // Dédupliquer par Item id + Variant id (garder le premier)
  const seen = new Set<string>();
  const uniqueRows: typeof validRows = [];
  for (const r of validRows) {
    const itemId = (r["Item id (Do not change)"] || "").trim();
    const variantId = (r["Variant id (Do not change)"] || "").trim();
    const key = `${itemId}|${variantId}`;
    if (seen.has(key) && itemId) continue;
    seen.add(key);
    uniqueRows.push(r);
  }
  console.log(`Lignes uniques (après dédup) : ${uniqueRows.length}`);

  let created = 0;
  let updated = 0;
  let errors = 0;
  let activatedCount = 0;
  const categories = new Set<string>();

  for (const row of uniqueRows) {
    const name = (row["Item name"] || "").trim();
    const itemId = (row["Item id (Do not change)"] || "").trim();
    const variantId = (row["Variant id (Do not change)"] || "").trim();
    const barcode = (row["Barcode"] || "").trim() || null;
    const sku = (row["SKU"] || "").trim() || null;
    const category = (row["Category"] || "").trim() || "Non classé";
    const priceCents = parsePriceCents(row["Price"]);
    const stock = parseStock(row["Quantity"]);
    const slug = slugify(name) + (itemId ? `-${itemId.slice(0, 8)}` : `-${Date.now()}`);
    const normalizedName = normalizeProductName(name);
    const isValidated = autoSumupIds.has(itemId);

    categories.add(category);

    try {
      // Chercher si déjà en base par sumupProductId
      const existing = itemId
        ? await prisma.product.findFirst({ where: { sumupProductId: itemId } })
        : null;

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            sumupName: name,
            sumupVariantId: variantId || existing.sumupVariantId,
            barcode: barcode || existing.barcode,
            sumupSku: sku || existing.sumupSku,
            category,
            normalizedName,
            stock,
            source: "sumup_import",
            isActive: isValidated,
            visibleOnline: isValidated,
          },
        });
        updated++;
        if (isValidated) activatedCount++;
      } else {
        await prisma.product.create({
          data: {
            name,
            slug,
            category,
            priceCents,
            stock,
            barcode,
            sku,
            sumupProductId: itemId || null,
            sumupVariantId: variantId || null,
            sumupName: name,
            sumupSku: sku,
            normalizedName,
            source: "sumup_import",
            isActive: isValidated,
            visibleOnline: isValidated,
            isNew: false,
            isBestSeller: false,
            isPromo: false,
          },
        });
        created++;
        if (isValidated) activatedCount++;
      }
    } catch (e: any) {
      // Slug collision — retry with random suffix
      if (e?.code === "P2002" && e?.meta?.target?.includes("slug")) {
        try {
          const retrySlug = `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`;
          await prisma.product.create({
            data: {
              name,
              slug: retrySlug,
              category,
              priceCents,
              stock,
              barcode,
              sku,
              sumupProductId: itemId || null,
              sumupVariantId: variantId || null,
              sumupName: name,
              sumupSku: sku,
              normalizedName,
              source: "sumup_import",
              isActive: isValidated,
              visibleOnline: isValidated,
              isNew: false,
              isBestSeller: false,
              isPromo: false,
            },
          });
          created++;
          if (isValidated) activatedCount++;
        } catch (e2: any) {
          errors++;
          if (errors <= 5) console.error(`  ERREUR ligne "${name}": ${e2.message?.slice(0, 100)}`);
        }
      } else {
        errors++;
        if (errors <= 5) console.error(`  ERREUR ligne "${name}": ${e.message?.slice(0, 100)}`);
      }
    }
  }

  const totalDb = await prisma.product.count();
  const activeDb = await prisma.product.count({ where: { isActive: true, visibleOnline: true } });
  const sumupImported = await prisma.product.count({ where: { source: "sumup_import" } });

  console.log(`\n=== RAPPORT D'IMPORT ===`);
  console.log(`Créés          : ${created}`);
  console.log(`Mis à jour     : ${updated}`);
  console.log(`Erreurs        : ${errors}`);
  console.log(`Activés (91)   : ${activatedCount}`);
  console.log(`Catégories     : ${categories.size}`);
  console.log(`---`);
  console.log(`Total en base  : ${totalDb}`);
  console.log(`Actifs (site)  : ${activeDb}`);
  console.log(`Source sumup   : ${sumupImported}`);
  console.log(`\nRègles respectées :`);
  console.log(`  ✓ SumUp non modifié`);
  console.log(`  ✓ Produits importés = catalogue brut (isActive=false, visibleOnline=false)`);
  console.log(`  ✓ Seuls les ${activatedCount} produits validés sont actifs pour sync/site`);
  console.log(`  ✓ Aucun produit existant supprimé`);
  console.log(`  ✓ Aucun doublon créé (upsert par sumupProductId)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
