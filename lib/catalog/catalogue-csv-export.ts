/**
 * Export des catalogues officiels CSV depuis PostgreSQL (source de vérité).
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { GLOBAL_STOCK_CODE } from "@/lib/catalog/normalize";
import { getGlobalStockForProduct } from "@/lib/catalog/stock";
import { getSumUpSyncConfig } from "@/lib/sumup/config";

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Record<string, string | number>[]): string {
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(";"));
  }
  return lines.join("\n") + "\n";
}

function mapStockStatus(status: string, qty: number): string {
  if (qty <= 0 || status === "RUPTURE") return "Rupture";
  if (status === "STOCK_FAIBLE") return "Stock faible";
  if (status === "EN_STOCK") return "Disponible";
  return "Inconnu";
}

function mapAvaAvailability(status: string, qty: number): "Disponible" | "Stock faible" | "Rupture" {
  if (qty <= 0 || status === "RUPTURE") return "Rupture";
  if (status === "STOCK_FAIBLE") return "Stock faible";
  return "Disponible";
}

export async function exportCatalogueMagasinCsv(targetPath?: string): Promise<{
  path: string;
  rows: number;
}> {
  const cfg = getSumUpSyncConfig();
  const outPath = targetPath || cfg.catalogueMagasinPath;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      brandRef: true,
      rangeRef: true,
      categoryRef: true,
      variants: { where: { active: true }, take: 1 },
      catalogImages: { where: { status: { in: ["official", "validated"] } }, take: 1 },
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });

  const now = new Date().toISOString();
  const rows: Record<string, string | number>[] = [];

  for (const p of products) {
    const snap = await getGlobalStockForProduct(p.id);
    const variant = p.variants[0];
    const statut = mapStockStatus(snap.status, snap.availableQuantity);
    rows.push({
      id_produit: p.reference || p.sku || p.id,
      ean: p.barcode || "",
      reference: p.reference || p.sku || "",
      reference_sumup: p.sumupReference || p.sumupProductId || "",
      nom_produit: p.name,
      marque: p.brand || p.brandRef?.name || "",
      gamme: p.range || p.rangeRef?.name || "",
      categorie: p.categoryRef?.name || p.category,
      format: variant?.capacityMl != null ? `${variant.capacityMl} ml` : "",
      nicotine: variant?.nicotineMg != null ? `${variant.nicotineMg}` : "",
      prix: p.priceCents > 0 ? (p.priceCents / 100).toFixed(2) : "",
      stock_general: snap.availableQuantity,
      stock_minimum: snap.lowStockThreshold,
      statut_stock: statut,
      actif: p.visibleOnline ? "Oui" : "Non",
      image: p.imageUrl || p.catalogImages[0]?.url || "",
      derniere_synchro_sumup: p.sumupLastSync?.toISOString() || now,
    });
  }

  const headers = [
    "id_produit",
    "ean",
    "reference",
    "reference_sumup",
    "nom_produit",
    "marque",
    "gamme",
    "categorie",
    "format",
    "nicotine",
    "prix",
    "stock_general",
    "stock_minimum",
    "statut_stock",
    "actif",
    "image",
    "derniere_synchro_sumup",
  ];

  fs.writeFileSync(outPath, toCsv(headers, rows), "utf8");
  return { path: outPath, rows: rows.length };
}

export async function exportCatalogueAvaCsv(targetPath?: string): Promise<{
  path: string;
  rows: number;
}> {
  const cfg = getSumUpSyncConfig();
  const outPath = targetPath || cfg.catalogueAvaPath;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      flavors: { take: 1 },
      avaMeta: true,
      rangeRef: true,
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });

  const rows: Record<string, string | number>[] = [];

  for (const p of products) {
    const snap = await getGlobalStockForProduct(p.id);
    const flavor = p.flavors[0];
    const dispo = mapAvaAvailability(snap.status, snap.availableQuantity);
    rows.push({
      id_produit: p.reference || p.sku || p.id,
      nom_produit: p.name,
      marque: p.brand || "",
      gamme: p.range || p.rangeRef?.name || "",
      saveur_principale: flavor?.primaryFlavor || "",
      saveurs_secondaires: [flavor?.secondaryFlavor, flavor?.secondaryFlavor2].filter(Boolean).join(", "),
      famille: flavor?.flavorFamily || "",
      fraicheur: flavor?.isFresh ? "Oui" : "Non",
      mots_cles: flavor?.searchKeywords || p.avaMeta?.avaKeywords || "",
      description_ava: p.avaMeta?.avaDescription || "",
      produits_similaires: p.avaMeta?.avaSimilaires || "",
      statut_disponibilite: dispo,
    });
  }

  const headers = [
    "id_produit",
    "nom_produit",
    "marque",
    "gamme",
    "saveur_principale",
    "saveurs_secondaires",
    "famille",
    "fraicheur",
    "mots_cles",
    "description_ava",
    "produits_similaires",
    "statut_disponibilite",
  ];

  fs.writeFileSync(outPath, toCsv(headers, rows), "utf8");
  return { path: outPath, rows: rows.length };
}

export async function exportOfficialCatalogues(): Promise<{
  magasin: { path: string; rows: number };
  ava: { path: string; rows: number };
}> {
  const [magasin, ava] = await Promise.all([exportCatalogueMagasinCsv(), exportCatalogueAvaCsv()]);
  return { magasin, ava };
}
