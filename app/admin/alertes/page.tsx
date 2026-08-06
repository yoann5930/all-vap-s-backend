import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { getEmailConfig } from "@/lib/email/config";
import { isVivaConfigured } from "@/lib/payments/viva";
import { isCarrierConfigured } from "@/lib/shipping/carriers";
import { getFideleAToutPublicStatus } from "@/lib/fidele-a-tout";

export const dynamic = "force-dynamic";

export default async function AdminAlertsPage() {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const [toPrepare, emailFails, outStock, pendingPay, noTracking] = await Promise.all([
    prisma.order.count({ where: { status: { in: ["PAID", "PREPARING"] } } }),
    prisma.emailLog.count({
      where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
    }),
    prisma.stockLevel.count({ where: { availableQuantity: { lte: 0 } } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({
      where: { status: "SHIPPED", trackingNumber: null },
    }),
  ]);

  const mail = getEmailConfig();
  const fat = getFideleAToutPublicStatus();

  type Alert = {
    level: "info" | "attention" | "important" | "critique";
    title: string;
    action: string;
    href: string;
  };

  const alerts: Alert[] = [];
  if (toPrepare > 0)
    alerts.push({
      level: "important",
      title: `${toPrepare} commande(s) à préparer`,
      action: "Ouvrir la préparation",
      href: "/admin/preparation",
    });
  if (emailFails > 0)
    alerts.push({
      level: "critique",
      title: `${emailFails} e-mail(s) en échec`,
      action: "Voir la boîte mail",
      href: "/admin/emails?filter=errors",
    });
  if (outStock > 0)
    alerts.push({
      level: "important",
      title: `${outStock} rupture(s) de stock`,
      action: "Gérer les stocks",
      href: "/admin/stocks?filter=out",
    });
  if (pendingPay > 0)
    alerts.push({
      level: "attention",
      title: `${pendingPay} paiement(s) en attente`,
      action: "Voir les commandes",
      href: "/admin/orders?filter=pending",
    });
  if (noTracking > 0)
    alerts.push({
      level: "attention",
      title: `${noTracking} colis expédié(s) sans suivi`,
      action: "Compléter le suivi",
      href: "/admin/expeditions?filter=incident",
    });
  if (!mail.smtp.hasPassword && !mail.resendConfigured)
    alerts.push({
      level: "important",
      title: "Service e-mail non configuré",
      action: "Paramètres e-mail",
      href: "/admin/parametres",
    });
  if (!isVivaConfigured())
    alerts.push({
      level: "info",
      title: "Paiement Viva non configuré (sandbox possible)",
      action: "Paramètres paiement",
      href: "/admin/parametres",
    });
  if (!isCarrierConfigured("mondial-relay"))
    alerts.push({
      level: "info",
      title: "Mondial Relay non connecté — suivi manuel",
      action: "Transporteurs",
      href: "/admin/transporteurs",
    });
  if (!fat.configured)
    alerts.push({
      level: "info",
      title: "Fidèle à Tout non connecté",
      action: "Module fidélité",
      href: "/admin/fidelite",
    });

  const tone: Record<string, string> = {
    info: "admin-badge-info",
    attention: "admin-badge-warning",
    important: "admin-badge-warning",
    critique: "admin-badge-danger",
  };

  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-medium text-[#f2f4f7]"
        style={{ fontFamily: "var(--adm-display)" }}
      >
        Centre d&apos;alertes
      </h1>
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="admin-card p-8 text-center text-[#8b95a5]">
            Aucune alerte active.
          </div>
        )}
        {alerts.map((a) => (
          <div key={a.title} className="admin-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <span className={`admin-badge ${tone[a.level]}`}>{a.level}</span>
              <p className="mt-2 text-sm text-[#f2f4f7]">{a.title}</p>
            </div>
            <Link href={a.href} className="admin-btn admin-btn-primary text-xs">
              {a.action}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
