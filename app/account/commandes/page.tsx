"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Order {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  deliveryMethod?: string;
  items: Array<{ quantity: number; priceCents: number; product: { name: string } }>;
}

const statusLabels: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  PENDING: { label: "En attente", variant: "warning" },
  PAID: { label: "Payée", variant: "success" },
  SHIPPED: { label: "Expédiée", variant: "success" },
  DELIVERED: { label: "Livrée", variant: "success" },
  CANCELLED: { label: "Annulée", variant: "danger" },
  REFUNDED: { label: "Remboursée", variant: "default" },
};

export default function CommandesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => {
        if (r.status === 401) { window.location.href = "/login"; return []; }
        return r.json();
      })
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-8 text-gray-500">Chargement...</div>;

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center">
        <p className="text-gray-500">Aucune commande.</p>
        <Button href="/boutique" className="mt-4">Boutique</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Mes commandes</h2>
      {orders.map((order) => {
        const s = statusLabels[order.status] || statusLabels.PENDING;
        return (
          <Card key={order.id}>
            <CardBody>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="font-medium">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <div className="text-right">
                  <Badge variant={s.variant}>{s.label}</Badge>
                  <p className="mt-1 font-bold text-brand-700">{formatPrice(order.totalCents)}</p>
                </div>
              </div>
              <ul className="mt-3 border-t pt-3 text-sm text-gray-600">
                {order.items.map((item, i) => (
                  <li key={i}>{item.product.name} × {item.quantity}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
