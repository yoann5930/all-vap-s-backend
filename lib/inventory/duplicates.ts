import prisma from "@/lib/prisma";

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
  reason: "SAME_SESSION" | "SAME_DAY" | "WITHIN_MONTH";
};

/**
 * Anti-doublon inventaire :
 * - même session
 * - même boutique + même jour
 * - même boutique dans les 30 derniers jours
 * (sessions non annulées)
 */
export async function findInventoryDuplicate(params: {
  barcode?: string | null;
  productId?: string | null;
  locationId: string;
  locationCode: string;
  currentSessionId: string;
  excludeLineId?: string;
}): Promise<DuplicateHit | null> {
  const barcode = (params.barcode || "").trim();
  if (!barcode && !params.productId) return null;

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const lines = await prisma.inventoryLine.findMany({
    where: {
      ...(params.excludeLineId ? { id: { not: params.excludeLineId } } : {}),
      OR: [
        ...(barcode ? [{ barcode }] : []),
        ...(params.productId ? [{ productId: params.productId }] : []),
      ],
      session: {
        locationId: params.locationId,
        status: { not: "CANCELLED" },
        OR: [
          { id: params.currentSessionId },
          { startedAt: { gte: monthAgo } },
        ],
      },
    },
    include: {
      session: { include: { location: true } },
    },
    orderBy: { scannedAt: "desc" },
    take: 20,
  });

  for (const line of lines) {
    const sameSession = line.sessionId === params.currentSessionId;
    const sameDay = line.scannedAt >= startOfDay;
    const withinMonth = line.scannedAt >= monthAgo;

    let reason: DuplicateHit["reason"] | null = null;
    if (sameSession) reason = "SAME_SESSION";
    else if (sameDay) reason = "SAME_DAY";
    else if (withinMonth) reason = "WITHIN_MONTH";

    if (!reason) continue;

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
      reason,
    };
  }

  return null;
}

export function duplicateMessage(hit: DuplicateHit): string {
  const when = new Date(hit.scannedAt).toLocaleString("fr-FR");
  const name = hit.productName || hit.barcode || "ce produit";
  if (hit.reason === "SAME_SESSION") {
    return `Doublon : ${name} déjà dans cet inventaire (qté ${hit.quantityCounted}) — modifiez la quantité, ne recréez pas la ligne.`;
  }
  if (hit.reason === "SAME_DAY") {
    return `Doublon du jour : ${name} déjà inventorié aujourd’hui (${when}, qté ${hit.quantityCounted}).`;
  }
  return `Doublon < 30 jours : ${name} déjà inventorié le ${when} (qté ${hit.quantityCounted}).`;
}
