import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/jwt";
import { getEmailConfig } from "@/lib/email/config";
import { isGmailApiConfigured } from "@/lib/email/gmail-labels";
import { isVivaConfigured } from "@/lib/payments/viva";
import { isPaymentTestMode } from "@/lib/payments/test-mode";
import { isCarrierConfigured } from "@/lib/shipping/carriers";
import { getFideleAToutPublicStatus } from "@/lib/fidele-a-tout";
import { getSumUpSyncConfig, isSumUpSyncConfigured } from "@/lib/sumup/config";

export const dynamic = "force-dynamic";

function statusPill(ok: boolean, labelOk: string, labelOff: string) {
  return (
    <span className={`admin-badge ${ok ? "admin-badge-success" : "admin-badge-neutral"}`}>
      {ok ? labelOk : labelOff}
    </span>
  );
}

export default async function AdminSettingsPage() {
  try {
    await requireStaff();
  } catch {
    redirect("/admin/login");
  }

  const mail = getEmailConfig();
  const fat = getFideleAToutPublicStatus();
  const sumup = getSumUpSyncConfig();

  const sections = [
    {
      title: "Identité & boutique",
      rows: [
        { k: "Site", v: process.env.NEXT_PUBLIC_APP_URL || "—" },
        { k: "Boutiques", v: "Hautmont · Le Quesnoy" },
      ],
    },
    {
      title: "E-mails A.V.A.",
      rows: [
        {
          k: "SMTP",
          v: statusPill(mail.smtp.hasPassword, "Configuré", "Non configuré"),
        },
        {
          k: "Resend",
          v: statusPill(mail.resendConfigured, "Configuré", "Non configuré"),
        },
        {
          k: "Gmail labels API",
          v: statusPill(isGmailApiConfigured(), "Credentials OK", "Non connecté"),
        },
        { k: "Admin notify", v: mail.adminNotificationEmail || "Non défini" },
      ],
    },
    {
      title: "Paiement",
      rows: [
        {
          k: "Viva",
          v: statusPill(isVivaConfigured(), "Configuré", "Non configuré"),
        },
        {
          k: "Mode test",
          v: statusPill(isPaymentTestMode(), "Actif (local)", "Inactif"),
        },
      ],
    },
    {
      title: "Transporteurs",
      rows: [
        {
          k: "Mondial Relay",
          v: statusPill(isCarrierConfigured("mondial-relay"), "Clé présente", "Non configuré"),
        },
        {
          k: "Relais Colis",
          v: statusPill(isCarrierConfigured("relais-colis"), "Clé présente", "Non configuré"),
        },
        {
          k: "Colissimo",
          v: statusPill(isCarrierConfigured("colissimo"), "Clé présente", "Non configuré"),
        },
      ],
    },
    {
      title: "Stock / SumUp",
      rows: [
        {
          k: "Sync SumUp",
          v: statusPill(
            sumup.syncEnabled && isSumUpSyncConfigured(),
            "Activée",
            sumup.syncEnabled ? "Clés manquantes" : "Désactivée"
          ),
        },
      ],
    },
    {
      title: "Fidélité",
      rows: [
        {
          k: "Fidèle à Tout",
          v: statusPill(fat.configured, "Configuré", "Non connecté"),
        },
        { k: "Message", v: fat.message },
      ],
    },
    {
      title: "Sécurité",
      rows: [
        { k: "JWT", v: statusPill(!!process.env.JWT_SECRET, "Défini", "Manquant") },
        {
          k: "DEMO_MODE",
          v: statusPill(process.env.DEMO_MODE !== "true", "Désactivé", "ACTIF — interdit en prod"),
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-medium text-[#f2f4f7]"
        style={{ fontFamily: "var(--adm-display)" }}
      >
        Paramètres
      </h1>
      <p className="text-sm text-[#8b95a5]">
        Les secrets ne sont jamais affichés — uniquement l&apos;état de configuration.
      </p>
      <p className="text-sm">
        <a href="/admin/notifications" className="admin-btn admin-btn-ghost">
          Notifications · rapports · téléphone · appareils
        </a>
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <section key={s.title} className="admin-card p-5">
            <h2 className="text-sm font-medium text-[#f2f4f7]">{s.title}</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {s.rows.map((r) => (
                <div key={r.k} className="flex items-start justify-between gap-4">
                  <dt className="text-[#8b95a5]">{r.k}</dt>
                  <dd className="text-right text-[#f2f4f7]">{r.v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
