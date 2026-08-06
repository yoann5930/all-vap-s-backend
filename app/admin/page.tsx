import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Package,
  PackageCheck,
  ShoppingCart,
  Truck,
  Warehouse,
  XCircle,
} from "lucide-react";
import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS, REVENUE_STATUSES } from "@/lib/orders/status";
import { getEmailConfig } from "@/lib/email/config";
import { isGmailApiConfigured } from "@/lib/email/gmail-labels";
import { isCarrierConfigured } from "@/lib/shipping/carriers";
import { isVivaConfigured } from "@/lib/payments/viva";
import { getFideleAToutPublicStatus } from "@/lib/fidele-a-tout";
import { requireStaff } from "@/lib/jwt";

export const dynamic = "force-dynamic";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function loadDashboard(firstName: string | null) {
  const today = startOfDay();
  const month = startOfMonth();

  const [
    ordersToday,
    toPrepare,
    prepared,
    shipped,
    delivered,
    pendingPay,
    caDay,
    caMonth,
    lowStock,
    outStock,
    emailFails,
    recentOrders,
    recentHistory,
    recentEmails,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PREPARING"] } } }),
    prisma.order.count({ where: { status: "PREPARED" } }),
    prisma.order.count({ where: { status: { in: ["SHIPPED", "AT_RELAY"] } } }),
    prisma.order.count({ where: { status: "DELIVERED", deliveredAt: { gte: today } } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: today } },
      _sum: { totalCents: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: month } },
      _sum: { totalCents: true },
    }),
    prisma.stockLevel.count({ where: { availableQuantity: { lte: 5, gt: 0 } } }),
    prisma.stockLevel.count({ where: { availableQuantity: { lte: 0 } } }),
    prisma.emailLog.count({
      where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        items: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.orderStatusHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { order: { select: { id: true, customerEmail: true } } },
    }),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      where: { status: { in: ["SENT", "FAILED", "SKIPPED"] } },
    }),
  ]);

  const mailCfg = getEmailConfig();
  const fat = getFideleAToutPublicStatus();

  const services: { name: string; state: "ok" | "warn" | "off" | "error"; detail: string }[] = [
    { name: "Base de données", state: "ok", detail: "PostgreSQL jointe" },
    {
      name: "Gmail / SMTP",
      state: mailCfg.smtp.hasPassword || mailCfg.resendConfigured ? "ok" : "off",
      detail: mailCfg.smtp.hasPassword
        ? "SMTP configuré"
        : mailCfg.resendConfigured
          ? "Resend configuré"
          : "Non configuré",
    },
    {
      name: "Libellés Gmail API",
      state: isGmailApiConfigured() ? "warn" : "off",
      detail: isGmailApiConfigured()
        ? "Credentials présents — API labels à finaliser"
        : "Non connecté",
    },
    {
      name: "Paiement Viva",
      state: isVivaConfigured() ? "ok" : "off",
      detail: isVivaConfigured() ? "Clés présentes" : "Sandbox / non configuré",
    },
    {
      name: "Mondial Relay",
      state: isCarrierConfigured("mondial-relay") ? "warn" : "off",
      detail: isCarrierConfigured("mondial-relay")
        ? "Clé détectée — API à brancher"
        : "Non configuré",
    },
    {
      name: "Relais Colis",
      state: isCarrierConfigured("relais-colis") ? "warn" : "off",
      detail: isCarrierConfigured("relais-colis")
        ? "Clé détectée — API à brancher"
        : "Non configuré",
    },
    {
      name: "La Poste / Colissimo",
      state: isCarrierConfigured("colissimo") ? "warn" : "off",
      detail: isCarrierConfigured("colissimo")
        ? "Clé détectée — API à brancher"
        : "Non configuré",
    },
    {
      name: "Fidèle à Tout",
      state: fat.configured ? "warn" : "off",
      detail: fat.message,
    },
  ];

  const priorities: { label: string; href: string; tone: "warn" | "danger" | "info" }[] = [];
  if (toPrepare > 0)
    priorities.push({
      label: `${toPrepare} commande(s) à préparer`,
      href: "/admin/preparation",
      tone: "warn",
    });
  if (pendingPay > 0)
    priorities.push({
      label: `${pendingPay} paiement(s) en attente`,
      href: "/admin/orders?filter=pending",
      tone: "info",
    });
  if (outStock > 0)
    priorities.push({
      label: `${outStock} rupture(s) stock`,
      href: "/admin/stocks?filter=out",
      tone: "danger",
    });
  if (lowStock > 0)
    priorities.push({
      label: `${lowStock} stock(s) faible(s)`,
      href: "/admin/stocks?filter=low",
      tone: "warn",
    });
  if (emailFails > 0)
    priorities.push({
      label: `${emailFails} e-mail(s) en échec (7j)`,
      href: "/admin/emails?filter=errors",
      tone: "danger",
    });

  const hello = firstName?.trim() || "Yoann";
  const prioritySentence =
    priorities.length === 0
      ? "Tout est calme pour le moment — aucun point critique."
      : `Priorité : ${priorities[0].label.toLowerCase()}.`;

  return {
    hello,
    prioritySentence,
    stats: [
      { label: "Commandes du jour", value: ordersToday, href: "/admin/orders?filter=today", icon: ShoppingCart },
      { label: "À préparer", value: toPrepare, href: "/admin/preparation", icon: PackageCheck },
      { label: "Prêtes", value: prepared, href: "/admin/orders?filter=prepared", icon: Package },
      { label: "Expédiées / relais", value: shipped, href: "/admin/expeditions", icon: Truck },
      { label: "Livrées (jour)", value: delivered, href: "/admin/orders?filter=delivered", icon: CheckCircle2 },
      { label: "Paiements en attente", value: pendingPay, href: "/admin/orders?filter=pending", icon: Clock },
      {
        label: "CA du jour",
        value: formatPrice(caDay._sum.totalCents || 0),
        href: "/admin/orders?filter=today",
        icon: ShoppingCart,
      },
      {
        label: "CA du mois",
        value: formatPrice(caMonth._sum.totalCents || 0),
        href: "/admin/orders",
        icon: ShoppingCart,
      },
      { label: "Stock faible", value: lowStock, href: "/admin/stocks?filter=low", icon: Warehouse },
      { label: "Ruptures", value: outStock, href: "/admin/stocks?filter=out", icon: AlertTriangle },
      { label: "E-mails en échec", value: emailFails, href: "/admin/emails?filter=errors", icon: Mail },
      { label: "Anomalies colis", value: 0, href: "/admin/expeditions?filter=incident", icon: XCircle },
    ],
    priorities,
    recentOrders,
    recentHistory,
    recentEmails,
    services,
  };
}

export default async function AdminDashboardPage() {
  let firstName: string | null = "Yoann";
  try {
    const auth = await requireStaff();
    const u = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { firstName: true },
    });
    firstName = u?.firstName || "Yoann";
  } catch {
    /* AuthBoundary gère la redirection */
  }

  const d = await loadDashboard(firstName);

  return (
    <div className="space-y-8">
      <header>
        <h1
          className="text-2xl font-medium tracking-tight text-[#f2f4f7] sm:text-3xl"
          style={{ fontFamily: "var(--adm-display)" }}
        >
          Bonjour {d.hello}
        </h1>
        <p className="mt-2 text-sm text-[#8b95a5]">{d.prioritySentence}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {d.stats.map((s) => (
          <Link key={s.label} href={s.href} className="admin-card admin-card-hover block p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-[#8b95a5]">{s.label}</p>
              <s.icon className="h-4 w-4 text-[#2f7cff]/80" strokeWidth={1.5} />
            </div>
            <p className="admin-stat-value mt-3">{s.value}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="admin-card p-5 xl:col-span-1">
          <h2 className="text-sm font-medium text-[#f2f4f7]">Priorités</h2>
          <ul className="mt-4 space-y-2">
            {d.priorities.length === 0 && (
              <li className="text-sm text-[#8b95a5]">Aucune action urgente.</li>
            )}
            {d.priorities.map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.03] ${
                    p.tone === "danger"
                      ? "border-[rgba(239,68,85,0.25)] text-[#ff8a95]"
                      : p.tone === "warn"
                        ? "border-[rgba(240,160,32,0.25)] text-[#f0a020]"
                        : "border-white/[0.08] text-[#8eb6ff]"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-card p-5 xl:col-span-2">
          <h2 className="text-sm font-medium text-[#f2f4f7]">Activité récente</h2>
          <ul className="mt-4 space-y-3">
            {d.recentHistory.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="w-36 shrink-0 text-xs text-[#8b95a5]">
                  {new Date(h.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[#f2f4f7]">
                  Commande #{h.order.id.slice(-8).toUpperCase()} →{" "}
                  {ORDER_STATUS_LABELS[h.toStatus] || h.toStatus}
                </span>
              </li>
            ))}
            {d.recentEmails.slice(0, 4).map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-36 shrink-0 text-xs text-[#8b95a5]">
                  {new Date(e.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[#f2f4f7]">
                  E-mail {e.type} · {e.status} → {e.recipientMasked}
                </span>
              </li>
            ))}
            {d.recentHistory.length === 0 && d.recentEmails.length === 0 && (
              <li className="text-sm text-[#8b95a5]">Pas encore d&apos;activité enregistrée.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="admin-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <h2 className="text-sm font-medium text-[#f2f4f7]">Commandes du jour</h2>
          <Link href="/admin/orders" className="text-xs text-[#8eb6ff] hover:underline">
            Tout voir
          </Link>
        </div>
        <div className="admin-table-wrap border-0">
          <table className="admin-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Livraison</th>
                <th>Statut</th>
                <th>Heure</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.recentOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-[#8b95a5]">
                    Aucune commande aujourd&apos;hui.
                  </td>
                </tr>
              )}
              {d.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td className="font-medium">#{o.id.slice(-8).toUpperCase()}</td>
                  <td>
                    {o.customerName ||
                      [o.user?.firstName, o.user?.lastName].filter(Boolean).join(" ") ||
                      o.customerEmail}
                  </td>
                  <td>{formatPrice(o.totalCents)}</td>
                  <td className="text-[#8b95a5]">{o.deliveryMethod || "—"}</td>
                  <td>
                    <span className="admin-badge admin-badge-info">
                      {ORDER_STATUS_LABELS[o.status] || o.status}
                    </span>
                  </td>
                  <td className="text-[#8b95a5]">
                    {new Date(o.createdAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} className="text-[#8eb6ff] hover:underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card p-5">
        <h2 className="text-sm font-medium text-[#f2f4f7]">État des services</h2>
        <p className="mt-1 text-xs text-[#8b95a5]">
          Voyants basés sur la configuration réelle — jamais marqués opérationnels sans contrôle.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.services.map((s) => (
            <div
              key={s.name}
              className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-3"
            >
              <span className="admin-service-dot mt-1.5" data-state={s.state} />
              <div>
                <p className="text-sm text-[#f2f4f7]">{s.name}</p>
                <p className="text-xs text-[#8b95a5]">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
