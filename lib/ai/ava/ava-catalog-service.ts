/**
 * AvaCatalogService — façade unique catalogue pour A.V.A.
 * Source runtime : PostgreSQL / Prisma (produits actifs + visibles).
 * CSV magasin / AVA : références d’audit uniquement, pas de duplication runtime.
 *
 * Règles : jamais inventer produit / EAN / compatibilité / prix / stock.
 * Disponibilité exposée en statut public uniquement (pas de qty brute sensible).
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { loadCatalogForAva } from "./load-catalog";
import {
  getProductDetailsForAva,
  searchNearbyAlternatives,
  searchProductsForAva,
} from "./product-search";
import type {
  AvaCatalogProduct,
  AvaRankedProduct,
  AvaSearchCriteria,
} from "./types";
import { AVA_SEARCH_CONFIG } from "./config";

export type AvaAvailabilityStatus =
  | "disponible"
  | "stock_faible"
  | "rupture"
  | "information_manquante";

export interface AvaCatalogFilters {
  manufacturer?: string | null;
  range?: string | null;
  category?: string | null;
  volumeMl?: number | null;
  nicotineMg?: number | null;
  flavorFamily?: AvaSearchCriteria["flavorFamily"];
  inStockOnly?: boolean;
  limit?: number;
}

export interface AvaFlavorProfile {
  productId: string;
  primaryFlavor: string | null;
  secondaryFlavor: string | null;
  flavorFamily: string | null;
  flavors: string[];
  isFresh: boolean | null;
  isFruity: boolean | null;
  isGourmet: boolean | null;
  isTobacco: boolean | null;
  isMint: boolean | null;
  isDrink: boolean | null;
  avaSaveurs: string | null;
  avaKeywords: string | null;
  avaDescription: string | null;
  validated: boolean;
}

export interface AvaCompatibleProduct {
  id: string;
  name: string;
  slug: string;
  reason: string;
  manufacturerName: string | null;
  range: string | null;
  category: string;
}

export interface AvaTroubleshootingKnowledge {
  productId: string;
  productName: string;
  deviceSupport: boolean;
  notes: string[];
  excluded: boolean;
  exclusionReason: string | null;
}

const LOW_STOCK_THRESHOLD = 3;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export class AvaCatalogService {
  private catalog: AvaCatalogProduct[] | null = null;

  /** Charge (ou recharge) le catalogue Prisma pour A.V.A. */
  async refresh(): Promise<number> {
    this.catalog = await loadCatalogForAva();
    return this.catalog.length;
  }

  private async ensureCatalog(): Promise<AvaCatalogProduct[]> {
    if (!this.catalog) this.catalog = await loadCatalogForAva();
    return this.catalog;
  }

  /** Index de recherche normalisé (serveur uniquement). */
  async buildSearchIndex() {
    const catalog = await this.ensureCatalog();
    return catalog.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      manufacturer: p.manufacturerName,
      range: p.range,
      brand: p.brand,
      category: p.category,
      formatMl: p.volumeMl,
      nicotine: p.variants
        .map((v) => v.nicotineLabel || (v.nicotineMg != null ? `${v.nicotineMg} mg` : null))
        .filter(Boolean),
      keywords: [p.searchKeywords, p.avaKeywords, p.avaSaveurs]
        .filter(Boolean)
        .join(" "),
      flavors: p.flavors,
      flavorFamily: p.flavorFamily,
      blob: norm(
        [
          p.name,
          p.manufacturerName,
          p.range,
          p.brand,
          p.category,
          p.primaryFlavor,
          p.secondaryFlavor,
          p.flavorFamily,
          p.flavors.join(" "),
          p.searchKeywords,
          p.avaKeywords,
          p.avaSaveurs,
          p.avaDescription,
          p.volumeMl != null ? `${p.volumeMl} ml` : "",
        ]
          .filter(Boolean)
          .join(" "),
      ),
    }));
  }

  async searchProducts(
    query: string,
    filters: AvaCatalogFilters = {},
  ): Promise<AvaRankedProduct[]> {
    const catalog = await this.ensureCatalog();
    const criteria: AvaSearchCriteria = {
      rawQuery: query,
      category: filters.category ?? null,
      flavorFamily: filters.flavorFamily ?? null,
      flavorTerms: query
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2),
      freshness: null,
      nicotineMg: filters.nicotineMg ?? null,
      volumeMl: filters.volumeMl ?? null,
      manufacturer: filters.manufacturer ?? null,
      range: filters.range ?? null,
    };

    const limit = filters.limit ?? AVA_SEARCH_CONFIG.maxProductResults;
    let results = searchProductsForAva(catalog, criteria, { limit });

    if (filters.manufacturer) {
      const m = norm(filters.manufacturer);
      results = results.filter(
        (r) =>
          norm(r.product.manufacturerName || "").includes(m) ||
          norm(r.product.brand || "").includes(m),
      );
    }
    if (filters.range) {
      const rg = norm(filters.range);
      results = results.filter((r) => norm(r.product.range || "").includes(rg));
    }
    if (filters.inStockOnly !== false) {
      results = results.filter((r) => !r.outOfStockExact);
    }

    if (!results.length) {
      return searchNearbyAlternatives(catalog, criteria, limit);
    }
    return results;
  }

  async getProductById(id: string): Promise<AvaCatalogProduct | null> {
    const catalog = await this.ensureCatalog();
    const fromCache = getProductDetailsForAva(catalog, id);
    if (fromCache) return fromCache;

    // Fallback Prisma direct (id stable même si hors cache filtre visible)
    const row = await prisma.product.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
        isActive: true,
      },
      select: { id: true, slug: true },
    });
    if (!row) return null;
    await this.refresh();
    return getProductDetailsForAva(this.catalog!, row.id);
  }

  /**
   * Disponibilité publique — jamais de quantité brute côté client.
   */
  async getProductAvailability(id: string): Promise<{
    productId: string;
    status: AvaAvailabilityStatus;
    label: string;
  }> {
    const product = await this.getProductById(id);
    if (!product) {
      return {
        productId: id,
        status: "information_manquante",
        label: "Produit introuvable dans le catalogue A.V.A.",
      };
    }

    const qty =
      product.variants.length > 0
        ? product.variants.reduce((s, v) => s + Math.max(0, v.stock), 0)
        : product.availableQuantity;

    if (!product.stockKnown) {
      return {
        productId: product.id,
        status: "information_manquante",
        label: "Disponibilité à confirmer en boutique",
      };
    }
    if (qty <= 0) {
      return {
        productId: product.id,
        status: "rupture",
        label: "Actuellement en rupture",
      };
    }
    if (qty <= LOW_STOCK_THRESHOLD) {
      return {
        productId: product.id,
        status: "stock_faible",
        label: "Stock limité — disponible",
      };
    }
    return {
      productId: product.id,
      status: "disponible",
      label: "Disponible",
    };
  }

  async getFlavorProfile(id: string): Promise<AvaFlavorProfile | null> {
    const product = await this.getProductById(id);
    if (!product) return null;
    return {
      productId: product.id,
      primaryFlavor: product.primaryFlavor,
      secondaryFlavor: product.secondaryFlavor,
      flavorFamily: product.flavorFamily,
      flavors: product.flavors,
      isFresh: product.isFresh,
      isFruity: product.isFruity,
      isGourmet: product.isGourmet,
      isTobacco: product.isTobacco,
      isMint: product.isMint,
      isDrink: product.isDrink,
      avaSaveurs: product.avaSaveurs,
      avaKeywords: product.avaKeywords,
      avaDescription: product.avaDescription,
      validated: product.flavorValidated,
    };
  }

  /**
   * Compatibilités : uniquement depuis données catalogue (même fabricant/gamme/catégorie).
   * Ne jamais inventer une compatibilité technique non documentée.
   */
  async getCompatibleProducts(id: string): Promise<AvaCompatibleProduct[]> {
    const product = await this.getProductById(id);
    if (!product) return [];
    const catalog = await this.ensureCatalog();

    const out: AvaCompatibleProduct[] = [];
    for (const p of catalog) {
      if (p.id === product.id) continue;
      let reason: string | null = null;
      if (
        product.range &&
        p.range &&
        norm(p.range) === norm(product.range) &&
        norm(p.manufacturerName || "") === norm(product.manufacturerName || "")
      ) {
        reason = "même gamme";
      } else if (
        product.flavorFamily &&
        p.flavorFamily &&
        norm(p.flavorFamily) === norm(product.flavorFamily) &&
        p.category === product.category
      ) {
        reason = "même famille de saveur";
      } else if (
        product.manufacturerName &&
        p.manufacturerName &&
        norm(p.manufacturerName) === norm(product.manufacturerName) &&
        p.category === product.category
      ) {
        reason = "même fabricant";
      }
      if (!reason) continue;
      out.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        reason,
        manufacturerName: p.manufacturerName,
        range: p.range,
        category: p.category,
      });
      if (out.length >= 8) break;
    }
    return out;
  }

  /**
   * Connaissances troubleshooting liées au produit.
   * Hors JNR / puffs / jetables. Pas d’invention médicale.
   */
  async getTroubleshootingKnowledge(
    productId: string,
  ): Promise<AvaTroubleshootingKnowledge> {
    const product = await this.getProductById(productId);
    if (!product) {
      return {
        productId,
        productName: "",
        deviceSupport: false,
        notes: ["Produit inconnu du catalogue A.V.A. — aucune procédure inventée."],
        excluded: true,
        exclusionReason: "produit_introuvable",
      };
    }

    const blob = norm(
      [product.name, product.category, product.productType, product.brand].join(" "),
    );
    const excluded =
      blob.includes("jnr") ||
      blob.includes("puff") ||
      blob.includes("jetable") ||
      blob.includes("disposable");

    if (excluded) {
      return {
        productId: product.id,
        productName: product.name,
        deviceSupport: false,
        notes: [
          "Ce type de produit (JNR / puff / jetable) est exclu du diagnostic matériel A.V.A.",
        ],
        excluded: true,
        exclusionReason: "hors_perimetre_diagnostic",
      };
    }

    const isHardware =
      /cigarette|pod|mod|kit|box|clearomiseur|resistance|batterie|atomiseur/.test(
        blob,
      ) || /materiel|device|hardware/.test(norm(product.category));

    const notes: string[] = [];
    if (isHardware) {
      notes.push(
        "Diagnostic matériel possible : décrivez le problème librement.",
      );
      notes.push(
        "Vous pouvez ajouter une photo ou une vidéo uniquement pour montrer le dysfonctionnement.",
      );
      notes.push(
        "A.V.A. ne demande jamais de facture, notice ni justificatif d’achat.",
      );
    } else {
      notes.push(
        "Produit catalogue (ex. e-liquide) : pas de diagnostic matériel associé.",
      );
      notes.push(
        "Pour un conseil saveur / dosage / format, posez votre question naturellement.",
      );
    }

    return {
      productId: product.id,
      productName: product.name,
      deviceSupport: isHardware,
      notes,
      excluded: false,
      exclusionReason: null,
    };
  }

  /** Chemins CSV officiels (audit / sync — pas la source runtime). */
  static officialCsvPaths() {
    const root = process.cwd();
    return {
      magasin: path.join(root, "catalogues", "catalogue-magasin-all-vaps.csv"),
      ava: path.join(root, "catalogues", "catalogue-ava-all-vaps.csv"),
      packMagasin: path.join(
        root,
        "ava",
        "03_CATALOGUE",
        "MAGASIN",
        "All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv",
      ),
      packAva: path.join(
        root,
        "ava",
        "03_CATALOGUE",
        "AVA",
        "All_Vaps_Profils_Saveurs_AVA_MAJ_Liquidarom.csv",
      ),
      packSumup: path.join(
        root,
        "ava",
        "03_CATALOGUE",
        "IMPORT_SUMUP",
        "EXPORT_SUMUP_2026-08-03.csv",
      ),
    };
  }

  static csvPresent() {
    const p = AvaCatalogService.officialCsvPaths();
    return Object.fromEntries(
      Object.entries(p).map(([k, v]) => [k, fs.existsSync(v)]),
    );
  }
}

/** Instance partagée (requête serveur). */
let singleton: AvaCatalogService | null = null;

export function getAvaCatalogService(): AvaCatalogService {
  if (!singleton) singleton = new AvaCatalogService();
  return singleton;
}
