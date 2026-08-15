/**
 * Synthèse stock AVA — lecture seule StockLevel (HAUTMONT + LE_QUESNOY).
 * Aucune écriture, aucun apply-stock, aucun PATCH.
 */
import prisma from "@/lib/prisma";
import { normalizeLoose } from "@/lib/ava/normalize-loose";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
} from "@/lib/catalog/normalize";
import { getDualStockForProduct } from "@/lib/catalog/stock";
import type { PreferredStoreId } from "@/lib/stores/preferred-store";
import type { AvaStockIntent } from "@/lib/ava/stock-question";

export {
  detectAvaStockQuestion,
  isAvaStockIntent,
  type AvaStockIntent,
  type DetectedStockQuestion,
} from "@/lib/ava/stock-question";

export type StoreStockSlice = {
  totalReferences: number;
  availableReferences: number;
  outOfStockReferences: number;
  totalUnits: number;
};

export type AvaStockSnapshot = {
  totalReferences: number;
  totalUnits: number;
  availableReferences: number;
  outOfStockReferences: number;
  stores: {
    hautmont: StoreStockSlice;
    leQuesnoy: StoreStockSlice;
  };
};

function sliceFromMap(byProduct: Map<string, number>): StoreStockSlice {
  let units = 0;
  let available = 0;
  let oos = 0;
  for (const qty of byProduct.values()) {
    units += Math.max(0, qty);
    if (qty > 0) available += 1;
    else oos += 1;
  }
  return {
    totalReferences: byProduct.size,
    availableReferences: available,
    outOfStockReferences: oos,
    totalUnits: units,
  };
}

/** Lecture seule. Ne jamais inventer un total si la base ne répond pas. */
export async function getAvaStockSummaryReadonly(): Promise<AvaStockSnapshot | null> {
  try {
    const levels = await prisma.stockLevel.findMany({
      where: {
        location: { code: { in: [HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE] } },
      },
      select: {
        productId: true,
        availableQuantity: true,
        location: { select: { code: true } },
      },
    });
    if (!levels.length) return null;

    const hautmont = new Map<string, number>();
    const quesnoy = new Map<string, number>();
    const global = new Map<string, number>();

    for (const row of levels) {
      const qty = Number(row.availableQuantity) || 0;
      const code = row.location?.code;
      const target = code === LE_QUESNOY_STOCK_CODE ? quesnoy : code === HAUTMONT_STOCK_CODE ? hautmont : null;
      if (!target) continue;
      target.set(row.productId, (target.get(row.productId) ?? 0) + qty);
      global.set(row.productId, (global.get(row.productId) ?? 0) + qty);
    }

    const g = sliceFromMap(global);
    return {
      totalReferences: g.totalReferences,
      totalUnits: g.totalUnits,
      availableReferences: g.availableReferences,
      outOfStockReferences: g.outOfStockReferences,
      stores: {
        hautmont: sliceFromMap(hautmont),
        leQuesnoy: sliceFromMap(quesnoy),
      },
    };
  } catch (err) {
    console.error("[ava] stock summary read failed", err);
    return null;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR");
}

function sliceLabel(store: PreferredStoreId | null): string {
  if (store === "hautmont") return "à Hautmont";
  if (store === "le-quesnoy") return "au Quesnoy";
  return "entre Hautmont et Le Quesnoy";
}

export function formatAvaStockSummaryAnswer(
  intent: AvaStockIntent,
  snap: AvaStockSnapshot | null,
  storeHint: PreferredStoreId | null,
): string {
  if (!snap) {
    return "Je ne peux pas confirmer le total du stock pour le moment : la lecture inventaire n'a renvoyé aucune donnée. Je ne vais pas inventer un chiffre.";
  }

  const slice =
    storeHint === "hautmont"
      ? snap.stores.hautmont
      : storeHint === "le-quesnoy"
        ? snap.stores.leQuesnoy
        : null;
  const data = slice ?? {
    totalReferences: snap.totalReferences,
    availableReferences: snap.availableReferences,
    outOfStockReferences: snap.outOfStockReferences,
    totalUnits: snap.totalUnits,
  };
  const where = sliceLabel(storeHint ?? (intent === "STOCK_BY_STORE" ? storeHint : null));
  const follow =
    "Si tu veux, je peux aussi te donner le détail par boutique ou les références en rupture.";

  if (intent === "STOCK_OUT_OF_STOCK_COUNT") {
    return `On a ${fmt(data.outOfStockReferences)} références actuellement en rupture ${where} (quantité disponible = 0, règle stock All Vap's). ${follow}`;
  }
  if (intent === "STOCK_AVAILABLE_COUNT") {
    return `On a ${fmt(data.availableReferences)} références disponibles ${where} en ce moment, pour ${fmt(data.totalUnits)} unités. ${follow}`;
  }
  if (intent === "STOCK_BY_STORE" && storeHint) {
    return `Oui. ${storeHint === "hautmont" ? "À Hautmont" : "Au Quesnoy"}, on a ${fmt(data.availableReferences)} références disponibles, représentant ${fmt(data.totalUnits)} unités. ${follow}`;
  }

  return `Oui. À l'instant, on a ${fmt(snap.availableReferences)} références disponibles, représentant ${fmt(snap.totalUnits)} unités au total entre Hautmont et Le Quesnoy. ${follow}`;
}

export async function formatAvaProductStockDetail(
  productHint: string | null,
  lastProposedIds: string[],
): Promise<string> {
  try {
    let product: { id: string; name: string } | null = null;
    if (lastProposedIds[0] && (!productHint || /\bce produit\b/i.test(productHint))) {
      product = await prisma.product.findUnique({
        where: { id: lastProposedIds[0] },
        select: { id: true, name: true },
      });
    }
    if (!product && productHint) {
      const q = productHint.trim();
      const hits = await prisma.product.findMany({
        where: {
          isActive: true,
          name: { contains: q, mode: "insensitive" },
        },
        take: 5,
        select: { id: true, name: true },
      });
      if (hits.length === 1) {
        product = hits[0];
      } else if (hits.length > 1) {
        const qn = normalizeLoose(q);
        const exact = hits.filter(
          (h) => normalizeLoose(h.name) === qn || normalizeLoose(h.name).includes(qn),
        );
        if (exact.length === 1) product = exact[0];
        else {
          return `Plusieurs références ressemblent à « ${q} ». Tu parles de ${hits
            .slice(0, 3)
            .map((h) => h.name)
            .join(", ")} ?`;
        }
      }
    }
    if (!product) {
      return "De quel produit parles-tu précisément ? Donne-moi le nom de la référence, je te dis si elle est disponible.";
    }
    const dual = await getDualStockForProduct(product.id);
    if (!dual.global.known) {
      return `Je ne peux pas confirmer la disponibilité de « ${product.name} » pour le moment.`;
    }
    const h = dual.hautmont.known ? dual.hautmont.availableQuantity : 0;
    const q = dual.leQuesnoy.known ? dual.leQuesnoy.availableQuantity : 0;
    const total = dual.global.availableQuantity;
    if (total <= 0) {
      return `« ${product.name} » est actuellement en rupture (0 unité disponible à Hautmont et au Quesnoy).`;
    }
    return `« ${product.name} » est disponible : ${fmt(total)} unité${total > 1 ? "s" : ""} au total (${fmt(h)} à Hautmont, ${fmt(q)} au Quesnoy).`;
  } catch (err) {
    console.error("[ava] product stock detail read failed", err);
    return "Je ne peux pas confirmer le stock de cette référence pour le moment. Je ne vais pas inventer un chiffre.";
  }
}

export const FORBIDDEN_GLOBAL_STOCK_REPLY = /on n['']a pas ce produit en stock/i;
