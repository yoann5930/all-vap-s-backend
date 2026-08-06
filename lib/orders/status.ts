import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Commande reçue — paiement en attente",
  PAID: "Paiement confirmé",
  PREPARING: "En cours de préparation",
  PREPARED: "Préparée",
  SHIPPED: "Expédiée",
  AT_RELAY: "Disponible en point relais",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
};

/** Transitions autorisées (workflow métier). */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CANCELLED"],
  PAID: ["PREPARING", "CANCELLED"],
  PREPARING: ["PREPARED", "CANCELLED"],
  PREPARED: ["SHIPPED", "AT_RELAY", "CANCELLED"],
  SHIPPED: ["AT_RELAY", "DELIVERED"],
  AT_RELAY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_TRANSITIONS[from] || []).includes(to);
}

export function orderStatusLabel(status: OrderStatus | string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] || String(status);
}

/** Statuts considérés comme « revenus » (CA). */
export const REVENUE_STATUSES: OrderStatus[] = [
  "PAID",
  "PREPARING",
  "PREPARED",
  "SHIPPED",
  "AT_RELAY",
  "DELIVERED",
];

/** Statuts à préparer côté admin. */
export const TO_PREPARE_STATUSES: OrderStatus[] = ["PAID", "PREPARING"];
