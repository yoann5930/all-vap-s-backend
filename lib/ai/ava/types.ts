import type { PreferredStoreId } from "@/lib/stores/preferred-store";

export type FreshnessPref = "with" | "without" | "any" | null;

export type AvaFlavorFamily =
  | "fruits_rouges"
  | "fruite"
  | "frais"
  | "gourmand"
  | "menthe"
  | "tabac"
  | "boisson"
  | "agrumes"
  | "exotique"
  | null;

export interface AvaVariantInfo {
  id: string;
  name: string;
  nicotineMg: number | null;
  nicotineLabel: string | null;
  capacityMl: number | null;
  stock: number;
  priceCents: number | null;
  active: boolean;
  pgVgLabel: string | null;
}

export interface AvaCatalogProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  category: string;
  brand: string | null;
  manufacturerName: string | null;
  range: string | null;
  productType: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  isPromo: boolean;
  isNew: boolean;
  isBestSeller?: boolean;
  stock: number;
  availableQuantity: number;
  stockKnown: boolean;
  imageUrl: string | null;
  isActive: boolean;
  visibleOnline: boolean;
  catalogStatus: string;
  volumeMl: number | null;
  primaryFlavor: string | null;
  secondaryFlavor: string | null;
  flavorFamily: string | null;
  flavors: string[];
  searchKeywords: string | null;
  isFresh: boolean | null;
  isFruity: boolean | null;
  isGourmet: boolean | null;
  isTobacco: boolean | null;
  isMint: boolean | null;
  isDrink: boolean | null;
  flavorValidated: boolean;
  avaKeywords: string | null;
  avaSaveurs: string | null;
  avaDescription: string | null;
  variants: AvaVariantInfo[];
}

export interface AvaSearchCriteria {
  rawQuery: string;
  category?: string | null;
  flavorFamily?: AvaFlavorFamily;
  flavorTerms: string[];
  freshness: FreshnessPref;
  nicotineMg: number | null;
  volumeMl: number | null;
  manufacturer?: string | null;
  range?: string | null;
  deviceModel?: string | null;
  promoOnly?: boolean;
  newOnly?: boolean;
  needsClarification?: "flavor" | "freshness" | "nicotine" | "device" | null;
  clarificationQuestion?: string | null;
}

export interface AvaConversationContext {
  category: string | null;
  flavorFamily: AvaFlavorFamily;
  flavorTerms: string[];
  freshness: FreshnessPref;
  nicotineMg: number | null;
  volumeMl: number | null;
  manufacturer: string | null;
  deviceModel: string | null;
  /** Valeurs remplacées par correction utilisateur (ne plus réutiliser). */
  superseded: Record<string, string[]>;
  refusedCriteria: string[];
  lastProposedProductIds: string[];
  lastProposedNames: string[];
  lastQuestion: string | null;
  preferredStoreId: PreferredStoreId | null;
  turn: number;
  /** Session diagnostic matériel (courte durée, pas de mémoire longue sans RGPD). */
  confirmedDevice?: import("@/lib/ava/device-confirmation").ConfirmedDeviceContext | null;
  diagnosticSession?: import("@/lib/ava/diagnostic-session").DiagnosticSession | null;
  /** Parcours action rapide (débutant, nicotine, fruits, matériel). */
  quickFlow?: import("@/lib/ava/quick-flows").AvaQuickFlowState | null;
}

export function emptyConversationContext(
  preferredStoreId: PreferredStoreId | null = null
): AvaConversationContext {
  return {
    category: null,
    flavorFamily: null,
    flavorTerms: [],
    freshness: null,
    nicotineMg: null,
    volumeMl: null,
    manufacturer: null,
    deviceModel: null,
    superseded: {},
    refusedCriteria: [],
    lastProposedProductIds: [],
    lastProposedNames: [],
    lastQuestion: null,
    preferredStoreId,
    turn: 0,
  };
}

export interface AvaRankedProduct {
  product: AvaCatalogProduct;
  score: number;
  matchedVariant: AvaVariantInfo | null;
  reason: string;
  needsVerification: boolean;
  outOfStockExact: boolean;
}

/** Carte produit renvoyée au client (sans secrets). */
export interface AvaProductCardDto {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  isPromo: boolean;
  stock: number;
  description: string | null;
  reason: string;
  nicotine: string | null;
  pgVg: string | null;
  volume: string | null;
  /** Variante nicotine / format pour le panier */
  variantId?: string | null;
}
