/**
 * Lecture stock réelle pour AVA. Jamais d'invention de quantité.
 */
import { getAvaCatalogService } from "@/lib/ai/ava";
import { getDualStockForProduct } from "@/lib/catalog/stock";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  type StoreStockCode,
} from "@/lib/catalog/normalize";
import { avaLog, type AvaLogDomain } from "@/lib/ava/logging";

export type AvaStockScope = "GLOBAL" | "HAUTMONT" | "LE_QUESNOY";

export type AvaStockSpeakResult = {
  ok: boolean;
  spoken: string;
  scope: AvaStockScope;
  known: boolean;
};

export const AVA_STOCK_UNAVAILABLE = "Je n'ai pas pu vérifier le stock.";
export const AVA_STOCK_UNIDENTIFIED = "Je n'ai pas identifié le produit pour vérifier le stock.";

export function detectStockScope(message: string): AvaStockScope {
  const n = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (n.includes("hautmont")) return "HAUTMONT";
  if (n.includes("quesnoy")) return "LE_QUESNOY";
  return "GLOBAL";
}

function extractQuery(message: string): string {
  return message
    .replace(/combien|il reste|stock|disponible|en rayon|a hautmont|au quesnoy|le quesnoy|hautmont/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function speakAvaStock(
  message: string,
  correlationId: string,
  opts?: { allowBoutiqueSplit?: boolean },
): Promise<AvaStockSpeakResult> {
  const domain: AvaLogDomain = "STOCK";
  const scope = detectStockScope(message);
  const allowSplit = opts?.allowBoutiqueSplit === true;
  try {
    const svc = getAvaCatalogService();
    const q = extractQuery(message) || message;
    const ranked = await svc.searchProducts(q, { limit: 3, inStockOnly: false });
    const top = ranked[0];
    if (!top?.product?.id) {
      avaLog(domain, correlationId, "no_product_match");
      return {
        ok: true,
        spoken: AVA_STOCK_UNIDENTIFIED,
        scope,
        known: false,
      };
    }

    const dual = await getDualStockForProduct(top.product.id);
    const name = top.product.name;

    if (scope !== "GLOBAL" && !allowSplit) {
      if (!dual.global.known) {
        return {
          ok: false,
          spoken: AVA_STOCK_UNAVAILABLE,
          scope,
          known: false,
        };
      }
      const qty = dual.global.availableQuantity;
      return {
        ok: true,
        spoken: `${name} : ${qty} au total All Vap's. Le détail par boutique est interne.`,
        scope: "GLOBAL",
        known: true,
      };
    }

    const loc: StoreStockCode =
      scope === "LE_QUESNOY" ? LE_QUESNOY_STOCK_CODE : HAUTMONT_STOCK_CODE;
    if (scope === "HAUTMONT" || scope === "LE_QUESNOY") {
      const snap = scope === "HAUTMONT" ? dual.hautmont : dual.leQuesnoy;
      if (!snap.known) {
        avaLog(domain, correlationId, "boutique_unknown", { loc });
        return {
          ok: false,
          spoken: AVA_STOCK_UNAVAILABLE,
          scope,
          known: false,
        };
      }
      const place = scope === "HAUTMONT" ? "Hautmont" : "Le Quesnoy";
      return {
        ok: true,
        spoken: `${name} : ${snap.availableQuantity} à ${place}.`,
        scope,
        known: true,
      };
    }

    if (!dual.global.known) {
      return {
        ok: false,
        spoken: AVA_STOCK_UNAVAILABLE,
        scope,
        known: false,
      };
    }
    if (allowSplit && dual.hautmont.known && dual.leQuesnoy.known) {
      return {
        ok: true,
        spoken: `${name} : ${dual.hautmont.availableQuantity} à Hautmont, ${dual.leQuesnoy.availableQuantity} au Quesnoy, ${dual.global.availableQuantity} au total.`,
        scope: "GLOBAL",
        known: true,
      };
    }
    return {
      ok: true,
      spoken: `${name} : ${dual.global.availableQuantity} en stock All Vap's.`,
      scope: "GLOBAL",
      known: true,
    };
  } catch (error) {
    avaLog(domain, correlationId, "stock_query_error", {
      err: error instanceof Error ? error.name : "unknown",
    });
    return {
      ok: false,
      spoken: AVA_STOCK_UNAVAILABLE,
      scope,
      known: false,
    };
  }
}
