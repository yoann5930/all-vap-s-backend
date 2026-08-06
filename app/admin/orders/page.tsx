import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";
import { getShippingOption } from "@/lib/shipping";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";
import { requireStaff } from "@/lib/jwt";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; where: Record<string, unknown> }> = {
  all: { label: "Toutes", where: {} },
  today: {
    label: "Aujourd'hui",
    where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  },
  pending: { label: "Paiement en attente", where: { status: "PENDING" } },
  to_prepare: { label: "À préparer", where: { status: { in: ["PAID", "PREPARING"] } } },
  prepared: { label: "Prêtes", where: { status: "PREPARED" } },
  shipped: { label: "Expédiées", where: { status: { in: ["SHIPPED", "AT_RELAY"] } } },
  delivered: { label: "Livrées", where: { status: "DELIVERED" } },
  cancelled: { label: "Annulées", where: { status: { in: ["CANCELLED", "REFUNDED"] } } },
};

function badgeClass(status: string) {
  if (["PAID", "DELIVERED", "SHIPPED", "AT_RELAY", "PREPARED"].includes(status))
    return "admin-badge-success";
  if (["PENDING", "PREPARING"].includes(status)) return "admin-badge-warning";
  if (["CANCELLED", "REFUNDED"].includes(status)) return "admin-badge-danger";
  return "admin-badge-neutral";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const sp = await searchParams;
  const filterKey = sp.filter && FILTERS[sp.filter] ? sp.filter : "all";
  const filter = FILTERS[filterKey];
  const q = (sp.q || "").trim();

  const where: Record<string, unknown> = { ...filter.where };
  if (q) {
    where.OR = [
      { id: { contains: q } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { trackingNumber: { contains: q } },
      { invoiceNumber: { contains: q } },
    ];
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      items: { include: { product: { select: { name: true } } } },
      user: { select: { email: true, firstName: true, lastName: true } },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
      documents: { select: { id: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-medium text-[#f2f4f7]"
            style={{ fontFamily: "var(--adm-display)" }}
          >
            Commandes
          </h1>
          <p className="mt-1 text-sm text-[#8b95a5]">{orders.length} résultat(s)</p>
        </div>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            className="admin-input w-56"
            placeholder="Rechercher…"
          />
          {filterKey !== "all" && <input type="hidden" name="filter" value={filterKey} />}
          <button type="submit" className="admin-btn admin-btn-primary">
            Filtrer
          </button>
        </form>
      </header>

      <div className="flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([key, f]) => (
          <Link
            key={key}
            href={key === "all" ? "/admin/orders" : `/admin/orders?filter=${key}`}
            className={`admin-btn text-xs ${
              filterKey === key ? "admin-btn-primary" : "admin-btn-ghost"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {orders.length === 0 && (
          <div className="admin-card p-8 text-center text-[#8b95a5]">Aucune commande.</div>
        )}
        {orders.map((order) => {
          const method = order.deliveryMethod
            ? getShippingOption(order.deliveryMethod)?.name
            : null;
          return (
            <article key={order.id} className="admin-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-lg font-medium text-[#f2f4f7] hover:text-[#8eb6ff]"
                  >
                    #{order.id.slice(-8).toUpperCase()}
                  </Link>
                  <p className="mt-1 text-sm text-[#8b95a5]">
                    {order.customerName || order.customerEmail}
                  </p>
                  <p className="text-xs text-[#8b95a5]/80">
                    {new Date(order.createdAt).toLocaleString("fr-FR")} ·{" "}
                    {order.items.length} article(s)
                    {method ? ` · ${method}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`admin-badge ${badgeClass(order.status)}`}>
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                  <p className="mt-2 text-xl font-medium text-[#f2f4f7]">
                    {formatPrice(order.totalCents)}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-sm text-[#8b95a5]">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>
                      {item.product.name} × {item.quantity}
                    </span>
                    <span>{formatPrice(item.priceCents * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              {order.documents.length > 0 && (
                <p className="mt-2 text-xs text-[#8b95a5]">
                  Docs :{" "}
                  {order.documents.map((d) => (
                    <a
                      key={d.id}
                      href={`/api/admin/documents/${d.id}`}
                      className="mr-2 text-[#8eb6ff] hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.type}
                    </a>
                  ))}
                </p>
              )}
              <div className="admin-order-actions-dark mt-2">
                <AdminOrderActions
                  orderId={order.id}
                  status={order.status}
                  trackingNumber={order.trackingNumber}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
