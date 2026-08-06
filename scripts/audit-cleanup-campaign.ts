/**
 * Nettoyage CONTRÔLÉ campagne audit — aucune correction métier.
 * Ne touche que les entités clairement marquées audit / test campagne.
 * Gmail : aucune suppression (API non configurée + aucun message réellement reçu).
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import prisma from "../lib/prisma";
import { validateCartStock } from "../lib/stock";

const CAMPAIGN_ID = "AUDIT-2026-07-30-MULTI";
const AUDIT_EMAIL_SUFFIX = "@allvaps-audit.local";

type ManifestRow = {
  kind: string;
  internalId: string;
  providerId: string | null;
  subjectOrTitle: string | null;
  recipientMasked: string | null;
  campaignId: string;
  auditOrderId: string | null;
  date: string;
  cleanupReason: string;
  action: string;
};

async function main() {
  const manifest: ManifestRow[] = [];
  const summary = {
    campaignId: CAMPAIGN_ID,
    startedAt: new Date().toISOString(),
    gmail: {
      apiConfigured: !!(
        process.env.GOOGLE_GMAIL_CLIENT_ID &&
        process.env.GOOGLE_GMAIL_CLIENT_SECRET &&
        process.env.GOOGLE_GMAIL_REFRESH_TOKEN
      ),
      messagesGenerated: 0,
      messagesReallyReceived: 0,
      messagesVerified: 0,
      movedToTrash: 0,
      retained: 0,
      notDeletedForSafety: 0,
      note: "" as string,
    },
    db: {} as Record<string, { found: number; action: string; detail?: string }>,
    stockRelockProof: [] as unknown[],
    auditMode: {
      existed: false,
      disabled: "n/a — mode jamais présent dans le code",
      residualConfig: false,
    },
    fidelite: {
      pointsAwardedToAuditUsers: 0,
      note: "Aucun compte Fidelatoo créé ; pas d'attribution points dans la campagne",
    },
  };

  // ─── Gmail / e-mails : aucune suppression ───
  summary.gmail.note =
    "Aucun e-mail réellement reçu en boîte. API Gmail non configurée. " +
    "Aucune mise en corbeille effectuée. Aucun libellé appliqué (connecteur absent). " +
    "Suppression Gmail : non exécutée par sécurité.";
  summary.gmail.notDeletedForSafety = 0;

  const auditEmailLogs = await prisma.emailLog.findMany({
    where: {
      OR: [
        { type: "management_report", transport: "console", createdAt: { gte: new Date("2026-07-30T05:40:00.000Z") } },
        { subject: { contains: "AUDIT" } },
        { subject: { contains: "[TEST]" } },
      ],
    },
    take: 50,
  });
  summary.gmail.messagesGenerated = auditEmailLogs.length;
  for (const e of auditEmailLogs) {
    manifest.push({
      kind: "email_log",
      internalId: e.id,
      providerId: null,
      subjectOrTitle: e.subject,
      recipientMasked: e.recipientMasked,
      campaignId: CAMPAIGN_ID,
      auditOrderId: e.relatedOrderId,
      date: e.createdAt.toISOString(),
      cleanupReason: "Log console/test — pas de message Gmail à mettre en corbeille",
      action: "conservé_comme_preuve_journal",
    });
    summary.gmail.retained += 1;
  }

  // ─── Users audit ───
  const auditUsers = await prisma.user.findMany({
    where: { email: { endsWith: AUDIT_EMAIL_SUFFIX } },
    select: { id: true, email: true, loyaltyPoints: true, createdAt: true },
  });
  summary.fidelite.pointsAwardedToAuditUsers = auditUsers.reduce((s, u) => s + (u.loyaltyPoints || 0), 0);

  const userIds = auditUsers.map((u) => u.id);
  const auditOrders = await prisma.order.findMany({
    where: {
      OR: [
        { customerEmail: { endsWith: AUDIT_EMAIL_SUFFIX } },
        { userId: { in: userIds.length ? userIds : ["__none__"] } },
      ],
    },
    select: { id: true, status: true, totalCents: true, customerEmail: true, createdAt: true },
  });

  // Sécurité : ne supprimer que PENDING (jamais PAID/SHIPPED réels)
  const deletableOrders = auditOrders.filter((o) => o.status === "PENDING");
  const retainedOrders = auditOrders.filter((o) => o.status !== "PENDING");

  for (const o of deletableOrders) {
    manifest.push({
      kind: "order",
      internalId: o.id,
      providerId: null,
      subjectOrTitle: `PENDING ${o.totalCents}c`,
      recipientMasked: o.customerEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
      campaignId: CAMPAIGN_ID,
      auditOrderId: o.id,
      date: o.createdAt.toISOString(),
      cleanupReason: "Commande audit PENDING uniquement",
      action: "suppression_db_planifiee",
    });
  }
  for (const o of retainedOrders) {
    manifest.push({
      kind: "order",
      internalId: o.id,
      providerId: null,
      subjectOrTitle: `${o.status} — non supprimée`,
      recipientMasked: o.customerEmail.replace(/(.{2}).+(@.+)/, "$1***$2"),
      campaignId: CAMPAIGN_ID,
      auditOrderId: o.id,
      date: o.createdAt.toISOString(),
      cleanupReason: "Statut non PENDING — conservation par sécurité",
      action: "non_supprime_par_securite",
    });
  }

  // Docs liés aux commandes audit PENDING
  const orderIds = deletableOrders.map((o) => o.id);
  const docs = orderIds.length
    ? await prisma.orderDocument.findMany({ where: { orderId: { in: orderIds } } })
    : [];
  summary.db.orderDocuments = {
    found: docs.length,
    action: docs.length ? "suppression_cascade_via_orders" : "aucun",
  };

  // Rapports test
  const testReports = await prisma.managementReport.findMany({
    where: {
      OR: [
        { isTest: true },
        { generatedBy: { startsWith: "audit" } },
      ],
    },
  });
  for (const r of testReports) {
    manifest.push({
      kind: "management_report",
      internalId: r.id,
      providerId: null,
      subjectOrTitle: r.title,
      recipientMasked: null,
      campaignId: CAMPAIGN_ID,
      auditOrderId: null,
      date: r.createdAt.toISOString(),
      cleanupReason: r.isTest ? "Rapport isTest" : "generatedBy audit*",
      action: "suppression_db_planifiee",
    });
  }

  // Events / alertes test
  const testEvents = await prisma.notificationEvent.findMany({
    where: {
      OR: [{ isTest: true }, { orderId: { startsWith: "AUDIT-" } }],
    },
  });
  for (const ev of testEvents) {
    manifest.push({
      kind: "notification_event",
      internalId: ev.id,
      providerId: null,
      subjectOrTitle: ev.title,
      recipientMasked: null,
      campaignId: CAMPAIGN_ID,
      auditOrderId: ev.orderId,
      date: ev.createdAt.toISOString(),
      cleanupReason: "Événement test / orderId AUDIT-*",
      action: "suppression_db_planifiee",
    });
  }

  const testAlerts = await prisma.adminAlert.findMany({ where: { isTest: true } });
  for (const a of testAlerts) {
    manifest.push({
      kind: "admin_alert",
      internalId: a.id,
      providerId: null,
      subjectOrTitle: a.title,
      recipientMasked: null,
      campaignId: CAMPAIGN_ID,
      auditOrderId: a.orderId,
      date: a.createdAt.toISOString(),
      cleanupReason: "AdminAlert isTest",
      action: "suppression_db_planifiee",
    });
  }

  const testSms = await prisma.smsOutbox.findMany({ where: { isTest: true } });
  for (const s of testSms) {
    manifest.push({
      kind: "sms_outbox",
      internalId: s.id,
      providerId: null,
      subjectOrTitle: s.bodyPreview,
      recipientMasked: s.toMasked,
      campaignId: CAMPAIGN_ID,
      auditOrderId: s.relatedOrderId,
      date: s.createdAt.toISOString(),
      cleanupReason: "SMS outbox isTest",
      action: "suppression_db_planifiee",
    });
  }

  // AvaGestion messages des users audit
  const avaMsgs = userIds.length
    ? await prisma.avaGestionMessage.findMany({ where: { userId: { in: userIds } } })
    : [];

  // ─── Exécution suppressions DB sûres ───
  let deletedOrders = 0;
  if (orderIds.length) {
    // documents cascade via OrderDocument relation onDelete Cascade
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    deletedOrders = orderIds.length;
  }
  summary.db.ordersPendingDeleted = {
    found: deletableOrders.length,
    action: "supprimé",
    detail: `${deletedOrders} PENDING audit`,
  };
  summary.db.ordersRetained = {
    found: retainedOrders.length,
    action: "non_supprime_par_securite",
  };

  const delReports = await prisma.managementReport.deleteMany({
    where: {
      OR: [{ isTest: true }, { generatedBy: { startsWith: "audit" } }],
    },
  });
  summary.db.managementReports = { found: testReports.length, action: `supprimé ${delReports.count}` };

  const delEvents = await prisma.notificationEvent.deleteMany({
    where: {
      OR: [{ isTest: true }, { orderId: { startsWith: "AUDIT-" } }],
    },
  });
  summary.db.notificationEvents = { found: testEvents.length, action: `supprimé ${delEvents.count}` };

  const delAlerts = await prisma.adminAlert.deleteMany({ where: { isTest: true } });
  summary.db.adminAlerts = { found: testAlerts.length, action: `supprimé ${delAlerts.count}` };

  const delSms = await prisma.smsOutbox.deleteMany({ where: { isTest: true } });
  summary.db.smsOutbox = { found: testSms.length, action: `supprimé ${delSms.count}` };

  if (avaMsgs.length) {
    await prisma.avaGestionMessage.deleteMany({ where: { userId: { in: userIds } } });
  }
  summary.db.avaGestionMessages = { found: avaMsgs.length, action: "supprimé" };

  // Users audit — suppression si plus de commandes restantes
  const remainingOrders = await prisma.order.count({
    where: { userId: { in: userIds.length ? userIds : ["__none__"] } },
  });
  if (remainingOrders === 0 && userIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationDevice.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    summary.db.auditUsers = { found: auditUsers.length, action: "supprimé" };
    for (const u of auditUsers) {
      manifest.push({
        kind: "user",
        internalId: u.id,
        providerId: null,
        subjectOrTitle: u.email.replace(/(.{2}).+(@.+)/, "$1***$2"),
        recipientMasked: u.email.replace(/(.{2}).+(@.+)/, "$1***$2"),
        campaignId: CAMPAIGN_ID,
        auditOrderId: null,
        date: u.createdAt.toISOString(),
        cleanupReason: "Profil audit sans commande restante",
        action: "supprimé",
      });
    }
  } else {
    summary.db.auditUsers = {
      found: auditUsers.length,
      action: "non_supprime_par_securite",
      detail: `remainingOrders=${remainingOrders}`,
    };
  }

  // EmailLog audit récents console management_report — conservation preuve (pas delete)
  summary.db.emailLogs = {
    found: auditEmailLogs.length,
    action: "conservé_comme_preuve",
  };

  // ─── Preuve reverrouillage stock (pas de mode audit à désactiver) ───
  const oos = await prisma.stockLevel.findFirst({
    where: { availableQuantity: { lte: 0 } },
    select: { productId: true, variantId: true, availableQuantity: true },
  });
  for (let i = 0; i < 3; i++) {
    if (!oos) {
      summary.stockRelockProof.push({
        iteration: i + 1,
        result: "NO_OOS_PRODUCT",
        note: "Aucun StockLevel <=0 — impossible de prouver le refus panier OOS",
      });
      continue;
    }
    const r = await validateCartStock([
      { productId: oos.productId, variantId: oos.variantId, quantity: 1 },
    ]);
    summary.stockRelockProof.push({
      iteration: i + 1,
      blocked: !r.ok,
      code: r.code,
      message: r.message,
      productId: oos.productId,
    });
  }

  // Stats production : les PENDING audit ne doivent plus apparaître
  const leftoverAuditOrders = await prisma.order.count({
    where: { customerEmail: { endsWith: AUDIT_EMAIL_SUFFIX } },
  });
  const leftoverAuditUsers = await prisma.user.count({
    where: { email: { endsWith: AUDIT_EMAIL_SUFFIX } },
  });

  summary.finishedAt = new Date().toISOString();
  const out = {
    summary,
    leftoverAuditOrders,
    leftoverAuditUsers,
    loyaltyPointsOnAuditUsersBeforeCleanup: summary.fidelite.pointsAwardedToAuditUsers,
    manifest,
    verdict:
      "AUDIT INCOMPLET — AU MOINS UNE VALIDATION RÉELLE OU UNE OPÉRATION DE NETTOYAGE RESTE À EFFECTUER",
    blockers: [
      "E-mails non reçus en boîte réelle",
      "Push non reçues sur appareil",
      "Mode Audit inexistant (désactivation N/A)",
      "Parcours HTTP UI non rejoués (serveur down)",
      "Gmail cleanup non exécuté (API absente + 0 message reçu)",
      "Paiements test confirmés / documents non exécutés dans la campagne",
    ],
  };

  const dir = path.join(process.cwd(), "docs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "AUDIT_CLEANUP_MANIFEST.json"),
    JSON.stringify(out, null, 2),
    "utf8"
  );
  console.log(JSON.stringify({
    verdict: out.verdict,
    leftoverAuditOrders,
    leftoverAuditUsers,
    deletedOrders,
    gmail: summary.gmail,
    stockRelockProof: summary.stockRelockProof,
    db: summary.db,
    fidelitePoints: summary.fidelite.pointsAwardedToAuditUsers,
  }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
