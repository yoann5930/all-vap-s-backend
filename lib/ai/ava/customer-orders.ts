import prisma from "@/lib/prisma";
import { orderStatusLabel } from "@/lib/orders/status";

/**
 * Contexte commandes réel pour A.V.A. — jamais inventé.
 */
export async function getCustomerOrdersForAva(userId: string, limit = 5) {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: {
        include: { product: { select: { name: true } } },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  return orders.map((o) => ({
    ref: o.id.slice(-8).toUpperCase(),
    status: o.status,
    statusLabel: orderStatusLabel(o.status),
    totalCents: o.totalCents,
    trackingNumber: o.trackingNumber,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => `${i.quantity}× ${i.product.name}`),
    recentStatusChanges: o.statusHistory.map((h) => ({
      to: orderStatusLabel(h.toStatus),
      at: h.createdAt.toISOString(),
    })),
  }));
}

export function formatOrdersForAvaPrompt(
  orders: Awaited<ReturnType<typeof getCustomerOrdersForAva>>
): string {
  if (!orders.length) {
    return "Le client n'a aucune commande enregistrée.";
  }
  return orders
    .map(
      (o) =>
        `Commande ${o.ref} — ${o.statusLabel} — ${(o.totalCents / 100).toFixed(2)} €` +
        (o.trackingNumber ? ` — suivi ${o.trackingNumber}` : "") +
        ` — articles : ${o.items.join(", ")}`
    )
    .join("\n");
}
