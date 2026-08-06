import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { ensureAvaGmailLabels, isGmailApiConfigured } from "@/lib/email/gmail-labels";
import { getEmailConfig } from "@/lib/email/config";

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  try {
    await requireAuth("ADMIN");
  } catch {
    redirect("/login?redirect=/admin/emails");
  }

  const cfg = getEmailConfig();
  const gmail = await ensureAvaGmailLabels();
  const logs = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">E-mails A.V.A.</h1>
      <Card>
        <CardBody className="text-sm space-y-1">
          <p>Transport : {cfg.transportPreference}</p>
          <p>SMTP configuré : {cfg.smtp.hasPassword ? "oui" : "non"}</p>
          <p>Resend : {cfg.resendConfigured ? "oui" : "non"}</p>
          <p>Admin notify : {cfg.adminNotificationEmail || "non défini"}</p>
          <p>Gmail API labels : {isGmailApiConfigured() ? "credentials présents" : "non connectée"}</p>
          <p className="text-gray-500">{gmail.message}</p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <h2 className="font-semibold">Journal (50 derniers)</h2>
          <ul className="mt-3 divide-y text-sm">
            {logs.map((l) => (
              <li key={l.id} className="py-2 flex justify-between gap-4">
                <span>
                  {l.type} → {l.recipientMasked} · {l.status}
                  {l.lastErrorCode ? ` (${l.lastErrorCode})` : ""}
                </span>
                <span className="text-gray-400">
                  {new Date(l.createdAt).toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
            {logs.length === 0 && <li className="py-2 text-gray-500">Aucun envoi journalisé.</li>}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
