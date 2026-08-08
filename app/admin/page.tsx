import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Mail,
  Package,
  PackageCheck,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS, REVENUE_STATUSES } from "@/lib/orders/status";
import { getEmailConfig } from "@/lib/email/config";
import { isGmailApiConfigured } from "@/lib/email/gmail-labels";
import { isCarrierConfigured } from "@/lib/shipping/carriers";
import { isVivaConfigured } from "@/lib/payments/viva";
import { getFideleAToutPublicStatus } from "@/lib/fidele-a-tout";
import { requireAuth } from "@/lib/jwt";

export const dynamic = "force-dynamic";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function safeCount(
  label: string,
  fn: () => Promise<number>
): Promise<{ value: number; error?: string }> {
  try {
    return { value: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[admin/dashboard] ${label}:`, msg);
    return { value: 0, error: msg };
  }
}

async function loadDashboard(firstName: string | null) {
  const today = startOfDay();
  const month = startOfMonth();
  const loadErrors: string[] = [];

  const track = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[admin/dashboard] ${label}:`, msg);
      loadErrors.push(`${label}: ${msg}`);
      return fallback;
    }
  };

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
    invOpen,
    invToValidate,
    invValidated,
    employeeCount,
    recentSessions,
    productCount,
  ] = await Promise.all([
    safeCount("ordersToday", () =>
      prisma.order.count({ where: { createdAt: { gte: today } } })
    ),
    safeCount("toPrepare", () =>
      prisma.order.count({ where: { status: { in: ["PAID", "PREPARING"] } } })
    ),
    safeCount("prepared", () => prisma.order.count({ where: { status: "PREPARED" } })),
    safeCount("shipped", () =>
      prisma.order.count({ where: { status: { in: ["SHIPPED", "AT_RELAY"] } } })
    ),
    safeCount("delivered", () =>
      prisma.order.count({ where: { status: "DELIVERED", deliveredAt: { gte: today } } })
    ),
    safeCount("pendingPay", () => prisma.order.count({ where: { status: "PENDING" } })),
    track(
      "caDay",
      () =>
        prisma.order.aggregate({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: today } },
          _sum: { totalCents: true },
        }),
      { _sum: { totalCents: 0 } }
    ),
    track(
      "caMonth",
      () =>
        prisma.order.aggregate({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: month } },
          _sum: { totalCents: true },
        }),
      { _sum: { totalCents: 0 } }
    ),
    safeCount("lowStock", () =>
      prisma.stockLevel.count({ where: { availableQuantity: { lte: 5, gt: 0 } } })
    ),
    safeCount("outStock", () =>
      prisma.stockLevel.count({ where: { availableQuantity: { lte: 0 } } })
    ),
    safeCount("emailFails", () =>
      prisma.emailLog.count({
        where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
      })
    ),
    track(
      "recentOrders",
      () =>
        prisma.order.findMany({
          where: { createdAt: { gte: today } },
          orderBy: { createdAt: "desc" },
          take: 12,
          include: {
            items: true,
            user: { select: { firstName: true, lastName: true } },
          },
        }),
      []
    ),
    track(
      "recentHistory",
      () =>
        prisma.orderStatusHistory.findMany({
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { order: { select: { id: true, customerEmail: true } } },
        }),
      []
    ),
    track(
      "recentEmails",
      () =>
        prisma.emailLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          where: { status: { in: ["SENT", "FAILED", "SKIPPED"] } },
        }),
      []
    ),
    safeCount("invOpen", () =>
      prisma.inventorySession.count({ where: { status: "OPEN" } })
    ),
    safeCount("invToValidate", () =>
      prisma.inventorySession.count({
        where: { status: { in: ["SUBMITTED", "COMPLETED"] } },
      })
    ),
    safeCount("invValidated", () =>
      prisma.inventorySession.count({ where: { status: "VALIDATED" } })
    ),
    safeCount("employeeCount", () =>
      prisma.user.count({ where: { role: "EMPLOYEE", active: true } })
    ),
    track(
      "recentSessions",
      () =>
        prisma.inventorySession.findMany({
          orderBy: { updatedAt: "desc" },
          take: 8,
          include: {
            location: { select: { name: true, code: true } },
            _count: { select: { lines: true } },
          },
        }),
      []
    ),
    safeCount("productCount", () => prisma.product.count()),
  ]);

  for (const c of [
    ordersToday,
    toPrepare,
    prepared,
    shipped,
    delivered,
    pendingPay,
    lowStock,
    outStock,
    emailFails,
    invOpen,
    invToValidate,
    invValidated,
    employeeCount,
    productCount,
  ]) {
    if (c.error) loadErrors.push(c.error);
  }

  const mailCfg = getEmailConfig();
  const fat = getFideleAToutPublicStatus();

  const services: { name: string; state: "ok" | "warn" | "off" | "error"; detail: string }[] = [
    {
      name: "Base de données",
      state: loadErrors.length ? "error" : "ok",
      detail: loadErrors.length
        ? `${loadErrors.length} requête(s) en échec — voir bandeau`
        : "PostgreSQL jointe",
    },
    {
      name: "Catalogue",
      state: productCount.error ? "error" : productCount.value > 0 ? "ok" : "warn",
      detail: productCount.error
        ? "Lecture catalogue en échec"
        : `${productCount.value} produit(s)`,
    },
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
  if (invToValidate.value > 0)
    priorities.push({
      label: `${invToValidate.value} inventaire(s) à valider`,
      href: "/admin/inventaires?status=SUBMITTED",
      tone: "warn",
    });
  if (invOpen.value > 0)
    priorities.push({
      label: `${invOpen.value} inventaire(s) en cours`,
      href: "/admin/inventaires?status=OPEN",
      tone: "info",
    });
  if (toPrepare.value > 0)
    priorities.push({
      label: `${toPrepare.value} commande(s) à préparer`,
      href: "/admin/orders?filter=to_prepare",
      tone: "warn",
    });
  if (pendingPay.value > 0)
    priorities.push({
      label: `${pendingPay.value} paiement(s) en attente`,
      href: "/admin/orders?filter=pending",
      tone: "info",
    });
  if (outStock.value > 0)
    priorities.push({
      label: `${outStock.value} rupture(s) stock`,
      href: "/admin/stocks?filter=out",
      tone: "danger",
    });
  if (lowStock.value > 0)
    priorities.push({
      label: `${lowStock.value} stock(s) faible(s)`,
      href: "/admin/stocks?filter=low",
      tone: "warn",
    });
  if (emailFails.value > 0)
    priorities.push({
      label: `${emailFails.value} e-mail(s) en échec (7j)`,
      href: "/admin/emails?filter=errors",
      tone: "danger",
    });

  const hello = firstName?.trim() || "Admin";
  const prioritySentence =
    priorities.length === 0
      ? "Tout est calme pour le moment — aucun point critique."
      : `Priorité : ${priorities[0].label.toLowerCase()}.`;

  return {
    hello,
    prioritySentence,
    loadErrors: [...new Set(loadErrors)],
    inventoryStats: [
      {
        label: "Inventaires en cours",
        value: invOpen.value,
        href: "/admin/inventaires?status=OPEN",
        icon: ClipboardList,
      },
      {
        label: "À valider",
        value: invToValidate.value,
        href: "/admin/inventaires?status=SUBMITTED",
        icon: Clock,
      },
      {
        label: "Validés",
        value: invValidated.value,
        href: "/admin/inventaires?status=VALIDATED",
        icon: CheckCircle2,
      },
      {
        label: "Employés actifs",
        value: employeeCount.value,
        href: "/admin/users",
        icon: Users,
      },
    ],
    stats: [
      {
        label: "Commandes du jour",
        value: ordersToday.value,
        href: "/admin/orders?filter=today",
        icon: ShoppingCart,
      },
      {
        label: "À préparer",
        value: toPrepare.value,
        href: "/admin/orders?filter=to_prepare",
        icon: PackageCheck,
      },
      { label: "Prêtes", value: prepared.value, href: "/admin/orders?filter=prepared", icon: Package },
      {
        label: "Expédiées / relais",
        value: shipped.value,
        href: "/admin/orders",
        icon: Truck,
      },
      {
        label: "Livrées (jour)",
        value: delivered.value,
        href: "/admin/orders?filter=delivered",
        icon: CheckCircle2,
      },
      {
        label: "Paiements en attente",
        value: pendingPay.value,
        href: "/admin/orders?filter=pending",
        icon: Clock,
      },
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
      {
        label: "Stock faible",
        value: lowStock.value,
        href: "/admin/stocks?filter=low",
        icon: Warehouse,
      },
      {
        label: "Ruptures",
        value: outStock.value,
        href: "/admin/stocks?filter=out",
        icon: AlertTriangle,
      },
      {
        label: "E-mails en échec",
        value: emailFails.value,
        href: "/admin/emails?filter=errors",
        icon: Mail,
      },
      {
        label: "Catalogue",
        value: productCount.value,
        href: "/admin/products",
        icon: Package,
      },
    ],
    priorities,
    recentOrders,
    recentHistory,
    recentEmails,
    recentSessions,
    services,
  };
}

function cardClass(extra = "") {
  return `rounded-xl border border-gray-200 bg-white shadow-sm ${extra}`;
}

function serviceDot(state: string) {
  if (state === "ok") return "bg-emerald-500";
  if (state === "warn") return "bg-amber-500";
  if (state === "error") return "bg-red-500";
  return "bg-gray-300";
}

export default async function AdminDashboardPage() {
  let firstName: string | null = null;
  try {
    const auth = await requireAuth("ADMIN");
    const u = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { firstName: true },
    });
    firstName = u?.firstName ?? null;
  } catch {
    /* layout redirige déjà */
  }

  const d = await loadDashboard(firstName);

  return (
    <div className="space-y-8 text-gray-900">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Bonjour {d.hello}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{d.prioritySentence}</p>
      </header>

      {d.loadErrors.length > 0 && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <p className="font-medium">Certaines données du dashboard n&apos;ont pas pu être chargées.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {d.loadErrors.slice(0, 6).map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Les compteurs affichés peuvent être incomplets (valeur 0). Vérifiez la connexion Prisma /
            les logs serveur. Aucune donnée métier n&apos;a été modifiée.
          </p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Inventaire</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {d.inventoryStats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cardClass("block p-4 transition hover:border-brand-300 hover:shadow")}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-500">{s.label}</p>
                <s.icon className="h-4 w-4 text-brand-600" strokeWidth={1.5} />
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{s.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Activité boutique</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {d.stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cardClass("block p-4 transition hover:border-brand-300 hover:shadow")}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-500">{s.label}</p>
                <s.icon className="h-4 w-4 text-brand-600/80" strokeWidth={1.5} />
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{s.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className={cardClass("p-5 xl:col-span-1")}>
          <h2 className="text-sm font-semibold text-gray-900">Priorités</h2>
          <ul className="mt-4 space-y-2">
            {d.priorities.length === 0 && (
              <li className="text-sm text-gray-500">Aucune action urgente.</li>
            )}
            {d.priorities.map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                    p.tone === "danger"
                      ? "border-red-200 text-red-700"
                      : p.tone === "warn"
                        ? "border-amber-200 text-amber-800"
                        : "border-blue-100 text-blue-700"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={cardClass("p-5 xl:col-span-2")}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Sessions d&apos;inventaire récentes</h2>
            <Link href="/admin/inventaires" className="text-xs text-brand-700 hover:underline">
              Tout voir
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {d.recentSessions.length === 0 && (
              <li className="text-sm text-gray-500">Aucune session d&apos;inventaire pour le moment.</li>
            )}
            {d.recentSessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <Link
                    href={`/admin/inventaires/${s.id}`}
                    className="font-medium text-gray-900 hover:text-brand-700"
                  >
                    {s.employeeName}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {s.location?.name || s.location?.code || "Boutique"} · {s._count.lines} ligne(s) ·{" "}
                    {s.status}
                  </p>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(s.updatedAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass("p-5")}>
          <h2 className="text-sm font-semibold text-gray-900">Activité commandes / e-mails</h2>
          <ul className="mt-4 space-y-3">
            {d.recentHistory.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="w-36 shrink-0 text-xs text-gray-500">
                  {new Date(h.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-gray-800">
                  Commande #{h.order.id.slice(-8).toUpperCase()} →{" "}
                  {ORDER_STATUS_LABELS[h.toStatus] || h.toStatus}
                </span>
              </li>
            ))}
            {d.recentEmails.slice(0, 4).map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-36 shrink-0 text-xs text-gray-500">
                  {new Date(e.createdAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-gray-800">
                  E-mail {e.type} · {e.status} → {e.recipientMasked}
                </span>
              </li>
            ))}
            {d.recentHistory.length === 0 && d.recentEmails.length === 0 && (
              <li className="text-sm text-gray-500">Pas encore d&apos;activité enregistrée.</li>
            )}
          </ul>
        </section>

        <section className={cardClass("overflow-hidden")}>
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Commandes du jour</h2>
            <Link href="/admin/orders" className="text-xs text-brand-700 hover:underline">
              Tout voir
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">N°</th>
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Montant</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {d.recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-gray-500">
                      Aucune commande aujourd&apos;hui.
                    </td>
                  </tr>
                )}
                {d.recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">#{o.id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-2">
                      {o.customerName ||
                        [o.user?.firstName, o.user?.lastName].filter(Boolean).join(" ") ||
                        o.customerEmail}
                    </td>
                    <td className="px-4 py-2">{formatPrice(o.totalCents)}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        {ORDER_STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/orders/${o.id}`} className="text-brand-700 hover:underline">
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={cardClass("p-5")}>
        <h2 className="text-sm font-semibold text-gray-900">État des services</h2>
        <p className="mt-1 text-xs text-gray-500">
          Voyants basés sur la configuration réelle — jamais marqués opérationnels sans contrôle.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.services.map((s) => (
            <div
              key={s.name}
              className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
            >
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${serviceDot(s.state)}`} />
              <div>
                <p className="text-sm text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
