import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";
import { getShippingOption, getTrackingUrl } from "@/lib/shipping";
import { isCarrierConfigured, deliveryMethodToCarrier } from "@/lib/shipping/carriers";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";

export const dynamic = "force-dynamic";

export default async function AdminExpeditionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const sp = await searchParams;
  const filter = sp.filter || "to_ship";

  let where: Prisma.OrderWhereInput = {
    status: { in: ["PREPARED", "SHIPPED", "AT_RELAY"] },
  };
  if (filter === "incident") {
    where = { status: { in: ["SHIPPED", "AT_RELAY"] }, trackingNumber: null };
  } else if (filter === "in_transit") {
    where = { status: "SHIPPED" };
  } else if (filter === "relay") {
    where = { status: "AT_RELAY" };
  } else if (filter === "delivered") {
    where = { status: "DELIVERED" };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 80,
    include: {
      items: { select: { id: true } },
    },
  });

  const tabs = [
    { key: "to_ship", label: "À expédier / en cours" },
    { key: "in_transit", label: "En transit" },
    { key: "relay", label: "Point relais" },
    { key: "delivered", label: "Livrés" },
    { key: "incident", label: "Sans suivi" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-medium text-[#f2f4f7]"
          style={{ fontFamily: "var(--adm-display)" }}
        >
          Expéditions & suivi
        </h1>
        <p className="mt-1 text-sm text-[#8b95a5]">
          Un colis n&apos;est marqué livré que sur confirmation réelle — jamais par estimation.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/expeditions?filter=${t.key}`}
            className={`admin-btn text-xs ${
              filter === t.key ? "admin-btn-primary" : "admin-btn-ghost"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {orders.length === 0 && (
          <div className="admin-card p-8 text-center text-[#8b95a5]">Aucun colis dans cette vue.</div>
        )}
        {orders.map((o) => {
          const carrier = deliveryMethodToCarrier(o.deliveryMethod);
          const trackingUrl = getTrackingUrl(o.deliveryMethod, o.trackingNumber);
          const days =
            o.shippedAt != null
              ? Math.floor((Date.now() - new Date(o.shippedAt).getTime()) / 864e5)
              : null;
          return (
            <article key={o.id} className="admin-card p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="text-lg font-medium text-[#f2f4f7] hover:text-[#8eb6ff]"
                  >
                    #{o.id.slice(-8).toUpperCase()}
                  </Link>
                  <p className="text-sm text-[#8b95a5]">{o.customerName || o.customerEmail}</p>
                  <p className="mt-1 text-xs text-[#8b95a5]">
                    {o.deliveryMethod
                      ? getShippingOption(o.deliveryMethod)?.name
                      : "—"}
                    {carrier
                      ? ` · API ${carrier}: ${
                          isCarrierConfigured(carrier) ? "clé détectée" : "non configurée"
                        }`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className="admin-badge admin-badge-info">
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                  {days != null && days >= 3 && o.status === "SHIPPED" && (
                    <p className="mt-2 text-xs text-[#f0a020]">{days} j. sans livraison</p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-[#f2f4f7]">
                Suivi :{" "}
                {o.trackingNumber ? (
                  trackingUrl ? (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#8eb6ff] hover:underline"
                    >
                      {o.trackingNumber}
                    </a>
                  ) : (
                    o.trackingNumber
                  )
                ) : (
                  <span className="text-[#f0a020]">non renseigné</span>
                )}
              </p>
              <AdminOrderActions
                orderId={o.id}
                status={o.status}
                trackingNumber={o.trackingNumber}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
