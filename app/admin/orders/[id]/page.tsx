import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";
import { getShippingOption, getTrackingUrl } from "@/lib/shipping";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const { id } = await params;
  const { tab = "resume" } = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { name: true, sku: true } },
          variant: { select: { name: true, nicotineLabel: true, nicotineMg: true } },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { email: true, firstName: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  const emails = await prisma.emailLog.findMany({
    where: { relatedOrderId: order.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const tabs = [
    { id: "resume", label: "Résumé" },
    { id: "preparation", label: "Préparation" },
    { id: "expedition", label: "Expédition" },
    { id: "documents", label: "Documents" },
    { id: "emails", label: "E-mails" },
    { id: "historique", label: "Historique" },
  ];

  const trackingUrl = getTrackingUrl(order.deliveryMethod, order.trackingNumber);

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm text-[#8eb6ff] hover:underline">
        ← Commandes
      </Link>

      <header className="admin-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-medium text-[#f2f4f7]"
              style={{ fontFamily: "var(--adm-display)" }}
            >
              Commande #{order.id.slice(-8).toUpperCase()}
            </h1>
            <p className="mt-1 text-sm text-[#8b95a5]">
              {order.customerName || order.customerEmail} ·{" "}
              {new Date(order.createdAt).toLocaleString("fr-FR")}
            </p>
          </div>
          <div className="text-right">
            <span className="admin-badge admin-badge-info">
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            <p className="mt-2 text-2xl font-medium text-[#f2f4f7]">
              {formatPrice(order.totalCents)}
            </p>
          </div>
        </div>
        <AdminOrderActions
          orderId={order.id}
          status={order.status}
          trackingNumber={order.trackingNumber}
        />
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/admin/orders/${order.id}?tab=${t.id}`}
            className={`admin-btn text-xs ${
              tab === t.id ? "admin-btn-primary" : "admin-btn-ghost"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href={`/admin/preparation/${order.id}`}
          className="admin-btn admin-btn-ghost text-xs"
        >
          Mode préparation
        </Link>
      </nav>

      {tab === "resume" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="admin-card p-5">
            <h2 className="text-sm font-medium text-[#f2f4f7]">Client</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">E-mail</dt>
                <dd>{order.customerEmail}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">Nom</dt>
                <dd>{order.customerName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">Tél.</dt>
                <dd>{order.user?.phone || "—"}</dd>
              </div>
              {order.user && (
                <div className="pt-2">
                  <Link
                    href={`/admin/customers?q=${encodeURIComponent(order.user.email)}`}
                    className="text-[#8eb6ff] hover:underline"
                  >
                    Ouvrir la fiche client
                  </Link>
                </div>
              )}
            </dl>
          </section>
          <section className="admin-card p-5">
            <h2 className="text-sm font-medium text-[#f2f4f7]">Livraison & paiement</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">Mode</dt>
                <dd>
                  {order.deliveryMethod
                    ? getShippingOption(order.deliveryMethod)?.name
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">Adresse</dt>
                <dd className="text-right">{order.shippingAddress || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">Paiement</dt>
                <dd>{order.paymentProvider || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#8b95a5]">Facture</dt>
                <dd>{order.invoiceNumber || "—"}</dd>
              </div>
            </dl>
          </section>
          <section className="admin-card p-5 lg:col-span-2">
            <h2 className="text-sm font-medium text-[#f2f4f7]">Articles</h2>
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {item.quantity}× {item.product.name}
                    {item.variant
                      ? ` — ${item.variant.name}${
                          item.variant.nicotineLabel
                            ? ` (${item.variant.nicotineLabel})`
                            : ""
                        }`
                      : ""}
                    {item.priceCents === 0 ? " [OFFERT]" : ""}
                  </span>
                  <span>{formatPrice(item.priceCents * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-sm">
              <div className="flex justify-between text-[#8b95a5]">
                <span>Remise</span>
                <span>-{formatPrice(order.discountCents)}</span>
              </div>
              <div className="flex justify-between text-[#8b95a5]">
                <span>Livraison</span>
                <span>{formatPrice(order.shippingCents)}</span>
              </div>
              <div className="flex justify-between font-medium text-[#f2f4f7]">
                <span>Total</span>
                <span>{formatPrice(order.totalCents)}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "preparation" && (
        <section className="admin-card p-5">
          <p className="text-sm text-[#8b95a5]">
            Démarrée : {order.preparingAt?.toLocaleString("fr-FR") || "—"} · Prête :{" "}
            {order.preparedAt?.toLocaleString("fr-FR") || "—"}
          </p>
          <Link
            href={`/admin/preparation/${order.id}`}
            className="admin-btn admin-btn-primary mt-4 inline-flex"
          >
            Ouvrir le mode préparation
          </Link>
        </section>
      )}

      {tab === "expedition" && (
        <section className="admin-card p-5 space-y-3 text-sm">
          <p>
            Transporteur :{" "}
            {order.deliveryMethod
              ? getShippingOption(order.deliveryMethod)?.name
              : "—"}
          </p>
          <p>
            Suivi :{" "}
            {order.trackingNumber ? (
              trackingUrl ? (
                <a href={trackingUrl} className="text-[#8eb6ff]" target="_blank" rel="noreferrer">
                  {order.trackingNumber}
                </a>
              ) : (
                order.trackingNumber
              )
            ) : (
              <span className="text-[#f0a020]">à saisir</span>
            )}
          </p>
          <p>Expédiée : {order.shippedAt?.toLocaleString("fr-FR") || "—"}</p>
          <p>Point relais : {order.atRelayAt?.toLocaleString("fr-FR") || "—"}</p>
          <p>Livrée : {order.deliveredAt?.toLocaleString("fr-FR") || "—"}</p>
        </section>
      )}

      {tab === "documents" && (
        <section className="admin-card p-5">
          {order.documents.length === 0 ? (
            <p className="text-sm text-[#8b95a5]">Aucun document généré.</p>
          ) : (
            <ul className="space-y-3">
              {order.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {d.type}
                    {d.invoiceNumber ? ` · ${d.invoiceNumber}` : ""} ·{" "}
                    {new Date(d.createdAt).toLocaleString("fr-FR")}
                  </span>
                  <a
                    href={`/api/admin/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="admin-btn admin-btn-ghost text-xs"
                  >
                    Télécharger / imprimer
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "emails" && (
        <section className="admin-card p-5">
          {emails.length === 0 ? (
            <p className="text-sm text-[#8b95a5]">Aucun e-mail lié.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {emails.map((e) => (
                <li key={e.id} className="flex justify-between gap-4 border-b border-white/[0.05] py-2">
                  <span>
                    {e.type} → {e.recipientMasked} · {e.status}
                    {e.lastErrorCode ? ` (${e.lastErrorCode})` : ""}
                  </span>
                  <span className="text-[#8b95a5]">
                    {new Date(e.createdAt).toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "historique" && (
        <section className="admin-card p-5">
          <ul className="space-y-2 text-sm">
            {order.statusHistory.map((h) => (
              <li key={h.id} className="border-b border-white/[0.05] py-2">
                <span className="text-[#8b95a5]">
                  {new Date(h.createdAt).toLocaleString("fr-FR")}
                </span>{" "}
                · {h.fromStatus || "—"} → {h.toStatus}
                {h.note ? ` · ${h.note}` : ""}
                {h.changedBy
                  ? ` · ${h.changedBy.firstName || h.changedBy.email}`
                  : " · système"}
              </li>
            ))}
            {order.statusHistory.length === 0 && (
              <li className="text-[#8b95a5]">Pas d&apos;historique.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
