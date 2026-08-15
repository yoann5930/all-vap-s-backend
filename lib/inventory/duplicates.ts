import prisma from "@/lib/prisma";
import {
  isSamePlacementDuplicate,
  normalizeInventoryPlacement,
  placementLabel,
  type InventoryPlacement,
} from "@/lib/inventory/placement";

export type DuplicateHit = {
  lineId: string;
  sessionId: string;
  barcode: string | null;
  productName: string | null;
  quantityCounted: number;
  unitPriceCents: number | null;
  scannedAt: Date;
  sessionStatus: string;
  storeCode: string;
  placement: InventoryPlacement;
  reason: "SAME_SESSION";
};

/**
 * Anti-doublon par produit et par emplacement, dans l’inventaire en cours.
 * - vitrine + vitrine = interdit
 * - stock + stock = interdit
 * - vitrine + stock = autorisé (deux lignes du même produit, pas un faux doublon)
 * Identité produit = barcode et/ou productId existants. Aucune création, aucun match flou.
 */
export async function findInventoryDuplicate(params: {
  barcode?: string | null;
  productId?: string | null;
  locationId: string;
  locationCode: string;
  currentSessionId: string;
  placement?: string | null;
  excludeLineId?: string;
  resistanceIdentity?: unknown;
}): Promise<DuplicateHit | null> {
  const barcode = (params.barcode || "").trim();
  if (!barcode && !params.productId) return null;

  const incoming = normalizeInventoryPlacement(params.placement);

  const or: Array<{ barcode?: string; productId?: string }> = [];
  if (barcode) or.push({ barcode });
  if (params.productId) or.push({ productId: params.productId });

  const lines = await prisma.inventoryLine.findMany({
    where: {
      ...(params.excludeLineId ? { id: { not: params.excludeLineId } } : {}),
      OR: or,
      session: {
        id: params.currentSessionId,
        locationId: params.locationId,
        status: { not: "CANCELLED" },
      },
    },
    include: {
      session: { include: { location: true } },
    },
    orderBy: { scannedAt: "desc" },
    take: 50,
  });

  for (const line of lines) {
    const existing = normalizeInventoryPlacement(
      (line as { placement?: string | null }).placement
    );
    if (!isSamePlacementDuplicate(existing, incoming)) continue;

    return {
      lineId: line.id,
      sessionId: line.sessionId,
      barcode: line.barcode,
      productName: line.productNameSnapshot,
      quantityCounted: line.quantityCounted,
      unitPriceCents: line.unitPriceCents,
      scannedAt: line.scannedAt,
      sessionStatus: line.session.status,
      storeCode: line.session.location.code,
      placement: existing,
      reason: "SAME_SESSION",
    };
  }

  return null;
}

export function duplicateMessage(hit: DuplicateHit): string {
  const name = hit.productName || hit.barcode || "ce produit";
  const where = placementLabel(hit.placement).toLowerCase();
  if (hit.placement === "VITRINE") {
    return `${name} déjà compté en vitrine (1 max). Corrigez la ligne existante, ne créez pas de doublon vitrine.`;
  }
  return `${name} déjà compté en stock (qté ${hit.quantityCounted}). Corrigez la quantité, ne créez pas une deuxième ligne ${where}.`;
}
