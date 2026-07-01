import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  PENDING: { label: "En attente", variant: "warning" },
  PAID: { label: "Payée", variant: "success" },
  SHIPPED: { label: "Expédiée", variant: "success" },
  DELIVERED: { label: "Livrée", variant: "success" },
  CANCELLED: { label: "Annulée", variant: "danger" },
  REFUNDED: { label: "Remboursée", variant: "default" },
};

async function getOrders() {
  try {
    return await prisma.order.findMany({
      include: {
        items: { include: { product: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return [];
  }
}

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
      <p className="mt-1 text-gray-600">{orders.length} commande(s)</p>

      <div className="mt-6 space-y-4">
        {orders.length === 0 ? (
          <p className="text-gray-500">Aucune commande.</p>
        ) : (
          orders.map((order) => {
            const statusInfo = statusLabels[order.status] || statusLabels.PENDING;
            return (
              <Card key={order.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">#{order.id.slice(-8).toUpperCase()}</p>
                      <p className="text-sm text-gray-500">{order.customerEmail}</p>
                      {order.customerName && (
                        <p className="text-sm text-gray-500">{order.customerName}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(order.createdAt).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      <p className="mt-1 text-lg font-bold text-brand-700">
                        {formatPrice(order.totalCents)}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-3 border-t pt-3 text-sm">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between text-gray-600">
                        <span>{item.product.name} × {item.quantity}</span>
                        <span>{formatPrice(item.priceCents * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  {order.shippingAddress && (
                    <p className="mt-2 text-xs text-gray-500">
                      Livraison : {order.shippingAddress}
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
