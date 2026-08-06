import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import prisma from "@/lib/prisma";
import { buildGestionSnapshot } from "@/lib/ava-gestion/analytics";
import {
  formatShopDateTime,
  resolvePeriod,
  startOfShopDay,
  endOfShopDay,
  getShopNowParts,
  type DatePeriod,
} from "@/lib/timezone/shop-tz";
import { getReportSettings } from "@/lib/settings/app-settings";
import { sendEmail } from "@/lib/email/service";
import { GMAIL_LABELS, applyGmailLabelIfConfigured } from "@/lib/email/gmail-labels";
import { emitNotificationEvent } from "@/lib/notifications/bus";

const STORAGE_ROOT = path.join(process.cwd(), "storage", "reports");

function dayIdempotencyKey(type: string, periodStart: Date, tz: string, isTest: boolean) {
  const p = getShopNowParts(tz, periodStart);
  return `${type}:${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}:${tz}${isTest ? ":test" : ""}`;
}

function snapshotToText(title: string, snapshot: Awaited<ReturnType<typeof buildGestionSnapshot>>): string {
  return [
    title,
    `Période : ${snapshot.period.label}`,
    `Fuseau : ${snapshot.period.timezone}`,
    `Généré : ${snapshot.generatedAt}`,
    `Source : ${snapshot.source}`,
    snapshot.lastSyncAt ? `Dernière sync : ${snapshot.lastSyncAt}` : "Dernière sync : n/a",
    "",
    "RÉSUMÉ",
    `- Commandes reçues : ${snapshot.orders.received}`,
    `- Commandes payées : ${snapshot.orders.paid}`,
    `- Paiements en attente : ${snapshot.orders.pendingPayment}`,
    `- Annulées : ${snapshot.orders.cancelled}`,
    `- CA confirmé : ${snapshot.revenue.confirmedLabel}`,
    `- Panier moyen : ${snapshot.revenue.averageBasketLabel ?? "n/a"}`,
    "",
    "PRÉPARATION",
    `- À préparer : ${snapshot.preparation.toPrepare}`,
    `- En préparation : ${snapshot.preparation.preparing}`,
    `- Prêtes : ${snapshot.preparation.prepared}`,
    "",
    "EXPÉDITION",
    `- Expédiées : ${snapshot.shipping.shipped}`,
    `- Relais : ${snapshot.shipping.atRelay}`,
    `- Livrées : ${snapshot.shipping.delivered}`,
    `- Sans mouvement : ${snapshot.shipping.stale.length}`,
    "",
    "VENTES",
    ...snapshot.sales.topProducts.slice(0, 5).map((p) => `- ${p.name} ×${p.qty}`),
    "",
    "STOCK",
    `- Faibles : ${snapshot.stock.low.length}`,
    `- Ruptures : ${snapshot.stock.out.length}`,
    `- Négatifs : ${snapshot.stock.negative.length}`,
    "",
    "DOCUMENTS",
    `- Factures : ${snapshot.documents.invoices}`,
    `- Factures manquantes : ${snapshot.documents.invoicesMissing.length}`,
    "",
    "E-MAILS",
    `- Envoyés : ${snapshot.emails.sent} / échecs : ${snapshot.emails.failed}`,
    "",
    "CLIENTS",
    `- Nouveaux comptes : ${snapshot.customers.newAccounts}`,
    `- Nouveaux ayant commandé : ${snapshot.customers.newWhoOrdered}`,
    "",
    "ALERTES",
    `- Paiements à vérifier : ${snapshot.alerts.paymentsToCheck.length}`,
    `- Stocks : ${snapshot.alerts.stockIssues}`,
    "",
    "Données manquantes / partielles :",
    ...snapshot.missing.map((m) => `- ${m}`),
  ].join("\n");
}

async function buildReportPdf(params: {
  title: string;
  reportId: string;
  text: string;
  generatedAt: string;
}): Promise<{ bytes: Uint8Array; fileName: string; storagePath: string }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;

  const draw = (line: string, useBold = false) => {
    if (y < 50) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(line.slice(0, 95), {
      x: 40,
      y,
      size: useBold ? 12 : 10,
      font: useBold ? bold : font,
    });
    y -= useBold ? 16 : 13;
  };

  draw("All Vap's — Rapport de gestion", true);
  draw(params.title, true);
  draw(`ID : ${params.reportId}`);
  draw(`Généré : ${params.generatedAt}`);
  draw("");
  for (const line of params.text.split("\n")) {
    draw(line || " ");
  }

  const bytes = await pdf.save();
  const fileName = `rapport-${params.reportId}.pdf`;
  const dir = path.join(STORAGE_ROOT);
  await mkdir(dir, { recursive: true });
  const storagePath = path.join("reports", fileName);
  await writeFile(path.join(process.cwd(), "storage", storagePath), bytes);
  return { bytes, fileName, storagePath };
}

export async function generateManagementReport(params: {
  type?: "daily" | "weekly" | "monthly" | "on_demand" | "custom";
  periodKey?: DatePeriod;
  timezone?: string;
  sendEmail?: boolean;
  generatedBy?: string;
  isTest?: boolean;
  force?: boolean;
}): Promise<{
  reportId: string;
  emailed: boolean;
  emailStatus: string;
  skippedReason?: string;
  hasRealPurchase: boolean;
  pdfPath: string | null;
}> {
  const settings = await getReportSettings();
  const tz = params.timezone || settings.timezone;
  const type = params.type || "on_demand";
  const periodKey =
    params.periodKey ||
    (type === "weekly" ? "this_week" : type === "monthly" ? "this_month" : "today");
  const period = resolvePeriod(periodKey, tz);
  const snapshot = await buildGestionSnapshot(period);
  const hasRealPurchase = snapshot.orders.paid > 0;

  const idem =
    type === "daily" || type === "weekly" || type === "monthly"
      ? dayIdempotencyKey(type, period.start, tz, !!params.isTest)
      : null;

  if (idem && !params.force) {
    const existing = await prisma.managementReport.findUnique({ where: { idempotencyKey: idem } });
    if (existing) {
      return {
        reportId: existing.id,
        emailed: existing.emailStatus === "sent",
        emailStatus: existing.emailStatus,
        skippedReason: "already_generated",
        hasRealPurchase: existing.hasRealPurchase,
        pdfPath: existing.pdfPath,
      };
    }
  }

  const title =
    type === "daily"
      ? `Rapport quotidien All Vap's — ${period.label}`
      : type === "weekly"
        ? `Rapport hebdomadaire All Vap's — ${period.label}`
        : type === "monthly"
          ? `Rapport mensuel All Vap's — ${period.label}`
          : `Rapport de gestion — ${period.label}`;

  const text = snapshotToText(title, snapshot);

  const report = await prisma.managementReport.create({
    data: {
      type,
      periodStart: period.start,
      periodEnd: period.end,
      timezone: tz,
      title,
      summaryJson: {
        orders: snapshot.orders,
        revenue: snapshot.revenue,
        hasRealPurchase,
      },
      dataJson: snapshot as object,
      idempotencyKey: idem,
      isTest: !!params.isTest,
      hasRealPurchase,
      generatedBy: params.generatedBy || "system",
      emailStatus: "none",
    },
  });

  let pdfPath: string | null = null;
  if (settings.pdfEnabled) {
    const pdf = await buildReportPdf({
      title,
      reportId: report.id,
      text,
      generatedAt: snapshot.generatedAt,
    });
    pdfPath = pdf.storagePath;
    await prisma.managementReport.update({
      where: { id: report.id },
      data: { pdfPath },
    });
  }

  let emailStatus = "none";
  let emailed = false;

  const shouldSend =
    params.sendEmail &&
    !params.isTest &&
    (hasRealPurchase || settings.sendEvenWithoutPurchase || type === "on_demand");

  if (params.sendEmail && params.isTest) {
    emailStatus = "skipped";
    await prisma.managementReport.update({
      where: { id: report.id },
      data: {
        emailStatus,
        emailLastError: "MODE TEST — e-mail non envoyé",
      },
    });
  } else if (params.sendEmail && type === "daily" && !hasRealPurchase && !settings.sendEvenWithoutPurchase) {
    emailStatus = "skipped";
    await prisma.managementReport.update({
      where: { id: report.id },
      data: {
        emailStatus,
        emailLastError: "Aucun achat réel sur la période — envoi quotidien non déclenché",
      },
    });
  } else if (shouldSend) {
    try {
      const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/admin/rapports`;
      const html = `
        <h2>${title}</h2>
        <pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>
        <p><a href="${adminUrl}">Ouvrir l'administration</a></p>
        <p style="color:#666;font-size:12px">Lien sans jeton — authentification requise.</p>
      `;
      const attachments =
        pdfPath && settings.pdfEnabled
          ? [
              {
                filename: path.basename(pdfPath),
                content: await import("fs/promises").then((fs) =>
                  fs.readFile(path.join(process.cwd(), "storage", pdfPath!))
                ),
                contentType: "application/pdf",
              },
            ]
          : undefined;

      const result = await sendEmail({
        to: settings.recipientEmail,
        subject: type === "daily" ? `Rapport quotidien All Vap's — ${period.label}` : title,
        html,
        text: `${text}\n\nOuvrir l'administration : ${adminUrl}`,
        type: "management_report",
        idempotencyKey: idem ? `email:${idem}` : `email:report:${report.id}`,
        attachments,
      });

      const ok = result.transport === "smtp" || result.transport === "resend";
      emailStatus = ok ? "sent" : result.transport === "console" ? "skipped" : "failed";
      emailed = ok;
      await prisma.managementReport.update({
        where: { id: report.id },
        data: {
          emailStatus,
          emailAttempts: { increment: 1 },
          emailSentAt: ok ? new Date() : null,
          emailLastError: ok
            ? null
            : result.transport === "console"
              ? "CONSOLE_ONLY_NOT_DELIVERED"
              : `transport=${result.transport}`,
        },
      });

      if (ok && result.messageId) {
        await applyGmailLabelIfConfigured({
          labelName: GMAIL_LABELS.MANAGEMENT_REPORTS,
          messageId: result.messageId,
        });
      }
    } catch (err) {
      emailStatus = "failed";
      await prisma.managementReport.update({
        where: { id: report.id },
        data: {
          emailStatus,
          emailAttempts: { increment: 1 },
          emailLastError: err instanceof Error ? err.message.slice(0, 200) : "send_failed",
        },
      });
    }
  }

  return {
    reportId: report.id,
    emailed,
    emailStatus,
    hasRealPurchase,
    pdfPath,
    skippedReason:
      emailStatus === "skipped" && !hasRealPurchase ? "no_real_purchase" : undefined,
  };
}

/**
 * Cron quotidien : génère + envoie si heure atteinte et pas déjà fait.
 * L'heure est lue UNIQUEMENT depuis AppSetting / env centralisés.
 */
export async function runDailyReportJob(now = new Date()): Promise<{
  ran: boolean;
  reason: string;
  result?: Awaited<ReturnType<typeof generateManagementReport>>;
}> {
  const settings = await getReportSettings();
  if (!settings.dailyEnabled || process.env.DAILY_REPORT_ENABLED === "false") {
    return { ran: false, reason: "daily_report_disabled" };
  }

  const tz = settings.timezone;
  const parts = getShopNowParts(tz, now);
  const [hh, mm] = settings.dailyTime.split(":").map((x) => Number(x));
  const minutesNow = parts.hour * 60 + parts.minute;
  const minutesTarget = (hh || 20) * 60 + (mm || 30);

  // Fenêtre de 15 minutes après l'heure cible (cron peut poller)
  if (minutesNow < minutesTarget || minutesNow > minutesTarget + 15) {
    return {
      ran: false,
      reason: `outside_window (now ${parts.hour}:${String(parts.minute).padStart(2, "0")} tz=${tz} target=${settings.dailyTime})`,
    };
  }

  const dayStart = startOfShopDay(tz, now);
  const result = await generateManagementReport({
    type: "daily",
    periodKey: "today",
    timezone: tz,
    sendEmail: true,
    generatedBy: "cron",
  });

  if (result.skippedReason === "already_generated") {
    return { ran: false, reason: "already_generated", result };
  }

  await emitNotificationEvent({
    type: "report.daily",
    title: "Rapport quotidien généré",
    description: `Rapport ${result.reportId} — CA période du ${formatShopDateTime(dayStart, tz)} — email=${result.emailStatus}`,
    severity: "info",
  });

  return { ran: true, reason: "ok", result };
}

export async function runWeeklyReportJob(now = new Date()) {
  const settings = await getReportSettings();
  if (!settings.weeklyEnabled) return { ran: false, reason: "weekly_disabled" };
  const parts = getShopNowParts(settings.timezone, now);
  // weekday: getDay style via UTC date from parts — Monday=1
  const wd = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const mondayBased = wd === 0 ? 7 : wd;
  if (mondayBased !== settings.weeklyDay) return { ran: false, reason: "wrong_day" };
  const result = await generateManagementReport({
    type: "weekly",
    periodKey: "last_week",
    sendEmail: true,
    generatedBy: "cron",
  });
  return { ran: true, reason: "ok", result };
}

export async function runMonthlyReportJob(now = new Date()) {
  const settings = await getReportSettings();
  if (!settings.monthlyEnabled) return { ran: false, reason: "monthly_disabled" };
  const parts = getShopNowParts(settings.timezone, now);
  if (parts.day !== settings.monthlyDay) return { ran: false, reason: "wrong_day" };
  const result = await generateManagementReport({
    type: "monthly",
    periodKey: "last_month",
    sendEmail: true,
    generatedBy: "cron",
  });
  return { ran: true, reason: "ok", result };
}

void endOfShopDay;
