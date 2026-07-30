/**
 * Base produit unique All Vap's — utilisée par site, A.V.A., recherche, filtres, stock, SumUp.
 */

export type ImageStatus = "official" | "pending" | "validated";

export type StockAvailability = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface CatalogProductBase {
  id: string;
  reference: string | null;
  ean: string | null;
  slug: string;
  fabricant: string | null;
  gamme: string | null;
  gammeSlug: string | null;
  nom: string;
  descriptionCourte: string | null;
  descriptionLongue: string | null;
  categorie: string;
  categorieSlug: string | null;
  marque: string | null;
  marqueSlug: string | null;
  saveurs: string[];
  saveurPrincipale: string | null;
  saveursSecondaires: string[];
  fraicheur: string | null;
  intensite: string | null;
  format: string | null;
  nicotine: number | null;
  /** Tous les dosages nicotine disponibles (variantes) */
  dosages?: number[];
  dosageLabels?: string[];
  pg: number | null;
  vg: number | null;
  pgVg: string | null;
  prix: number;
  promo: number | null;
  stock: number;
  stockDisponibilite: StockAvailability;
  photo: string | null;
  photoStatut: ImageStatus;
  galerie: string[];
  visible: boolean;
  ordre: number;
  dateCreation: Date;
  dateModification: Date;
  isNew: boolean;
  isPromo: boolean;
  isBestSeller: boolean;
}

/** Champs A.V.A. — jamais exposés au front public */
export interface CatalogAvaMeta {
  avaKeywords: string | null;
  avaDescription: string | null;
  avaRecommendations: string | null;
  avaSaveurs: string | null;
  avaSimilaires: string | null;
  avaQuestions: string | null;
}

/** Champs SumUp — synchronisation stock uniquement */
export interface CatalogSumUpMeta {
  sumupName: string | null;
  sumupReference: string | null;
  sumupSku: string | null;
  sumupMapping: string | null;
  sumupLastSync: Date | null;
  sumupProductId: string | null;
  sumupVariantId: string | null;
}

export interface CatalogProductFull extends CatalogProductBase {
  ava?: CatalogAvaMeta;
  sumup?: CatalogSumUpMeta;
  profilGustatif: {
    fruit: boolean;
    menthole: boolean;
    boisson: boolean;
    dessert: boolean;
    tabac: boolean;
    bonbon: boolean;
    frais: boolean;
    tresFrais: boolean;
    sucre: boolean;
    acidule: boolean;
  };
}

export type CatalogFilterKey =
  | "fabricant"
  | "gamme"
  | "saveur"
  | "fruit"
  | "menthole"
  | "boisson"
  | "dessert"
  | "tabac"
  | "bonbon"
  | "frais"
  | "tres_frais"
  | "sucre"
  | "acidule"
  | "pgvg"
  | "format"
  | "nicotine"
  | "disponibilite";
