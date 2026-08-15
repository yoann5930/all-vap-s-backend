import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";
import { getShippingOption } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export default async function AdminPreparationPage() {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const orders = await prisma.order.findMany({
    where: { status: { in: ["PAID", "PREPARING", "PREPARED"] } },
    include: {
      items: {
        include: {
          product: { select: { name: true, imageUrl: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-medium text-[#f2f4f7]"
          style={{ fontFamily: "var(--adm-display)" }}
        >
          Mode préparation
        </h1>
        <p className="mt-1 text-sm text-[#8b95a5]">
          Interface rapide pour prélever et contrôler les commandes payées.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.length === 0 && (
          <div className="admin-card col-span-full p-10 text-center text-[#8b95a5]">
            Aucune commande à préparer.
          </div>
        )}
        {orders.map((o) => {
          const urgent =
            Date.now() - new Date(o.createdAt).getTime() > 6 * 3600 * 1000;
          const method = o.deliveryMethod
            ? getShippingOption(o.deliveryMethod)?.name
            : "—";
          return (
            <Link
              key={o.id}
              href={`/admin/preparation/${o.id}`}
              className="admin-card admin-card-hover block p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-medium text-[#f2f4f7]">
                  #{o.id.slice(-8).toUpperCase()}
                </p>
                {urgent && (
                  <span className="admin-badge admin-badge-warning">Urgent</span>
                )}
              </div>
              <p className="mt-2 text-sm text-[#8b95a5]">{o.customerName || o.customerEmail}</p>
              <p className="mt-1 text-xs text-[#8b95a5]">
                {ORDER_STATUS_LABELS[o.status]} · {method} · {o.items.length} produit(s)
              </p>
              <p className="mt-3 text-sm text-[#f2f4f7]">{formatPrice(o.totalCents)}</p>
              <p className="mt-1 text-xs text-[#8b95a5]">
                {new Date(o.createdAt).toLocaleString("fr-FR")}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
