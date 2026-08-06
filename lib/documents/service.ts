import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import type { OrderDocumentType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/service";
import { getEmailConfig } from "@/lib/email/config";
import { applyGmailLabelIfConfigured } from "@/lib/email/gmail-labels";
import {
  archiveMemoryArtifact,
  refreshClientMemoryFromOrders,
} from "@/lib/ava-memory/service";
import { buildBrandedOrderPdf } from "@/lib/documents/pdf-templates";

const STORAGE_ROOT = path.join(process.cwd(), "storage", "orders");

function shortRef(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function getAvaArchiveEmail(): string | null {
  const explicit = (process.env.AVA_ARCHIVE_EMAIL || "").trim();
  if (explicit) return explicit.toLowerCase();
  const from =
    process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER || "avaallvaps@gmail.com";
  return from.trim().toLowerCase() || null;
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await prisma.$transaction(async (tx) => {
    const row = await tx.invoiceSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return row.lastNumber;
  });
  return `AV-${year}-${String(seq).padStart(5, "0")}`;
}

async function loadOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { select: { name: true, sku: true } },
          variant: { select: { name: true, nicotineLabel: true, nicotineMg: true } },
        },
      },
    },
  });
  if (!order) throw new Error("NOT_FOUND");
  return order;
}

type OrderLoaded = Awaited<ReturnType<typeof loadOrder>>;

function docTitle(type: OrderDocumentType, invoiceNumber?: string | null): string {
  switch (type) {
    case "ORDER_FORM":
      return "Bon de commande";
    case "PREP_SLIP":
      return "Bon de préparation";
    case "DELIVERY_SLIP":
      return "Bon de livraison";
    case "INVOICE":
      return `Facture ${invoiceNumber || ""}`.trim();
    default:
      return "Document";
  }
}

function memoryKindForDoc(type: OrderDocumentType) {
  switch (type) {
    case "ORDER_FORM":
      return "order_form" as const;
    case "INVOICE":
      return "invoice" as const;
    case "PREP_SLIP":
      return "prep_slip" as const;
    case "DELIVERY_SLIP":
      return "delivery_slip" as const;
    default:
      return "note" as const;
  }
}

async function buildPdf(
  order: OrderLoaded,
  type: OrderDocumentType,
  invoiceNumber?: string | null
): Promise<Uint8Array> {
  return buildBrandedOrderPdf(order, type, invoiceNumber);
}

/**
 * Génère un PDF, le stocke sur disque et l'enregistre en base (1 seul par type/commande).
 */
export async function generateAndStoreOrderDocument(
  orderId: string,
  type: OrderDocumentType
) {
  const order = await loadOrder(orderId);
  let invoiceNumber: string | null = order.invoiceNumber;

  if (type === "INVOICE" && !invoiceNumber) {
    invoiceNumber = await nextInvoiceNumber();
    await prisma.order.update({
      where: { id: orderId },
      data: { invoiceNumber },
    });
  }

  const bytes = await buildPdf(order, type, invoiceNumber);
  const dir = path.join(STORAGE_ROOT, orderId);
  await mkdir(dir, { recursive: true });
  const fileName = `${type.toLowerCase()}-${shortRef(orderId)}.pdf`;
  const storagePath = path.join("storage", "orders", orderId, fileName);
  const abs = path.join(process.cwd(), storagePath);
  await writeFile(abs, bytes);

  const doc = await prisma.orderDocument.upsert({
    where: { orderId_type: { orderId, type } },
    create: {
      orderId,
      type,
      fileName,
      storagePath,
      sizeBytes: bytes.length,
      invoiceNumber,
    },
    update: {
      fileName,
      storagePath,
      sizeBytes: bytes.length,
      invoiceNumber,
    },
  });

  await archiveMemoryArtifact({
    userId: order.userId,
    orderId,
    kind: memoryKindForDoc(type),
    idempotencyKey: `mem:doc:${orderId}:${type}`,
    title: docTitle(type, invoiceNumber),
    documentId: doc.id,
    metaJson: { fileName, storagePath, invoiceNumber },
  });

  return doc;
}

export async function readOrderDocumentBytes(documentId: string): Promise<{
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}> {
  const doc = await prisma.orderDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("NOT_FOUND");
  const abs = path.join(process.cwd(), doc.storagePath);
  const bytes = await readFile(abs);
  return { bytes, fileName: doc.fileName, mimeType: doc.mimeType };
}

type DocAudience = "customer" | "manager" | "ava" | "internal";

type DocRoute = {
  toCustomer: boolean;
  toManager: boolean;
  toAva: boolean;
  gmailLabel: string;
};

/** Règles Yoann — qui reçoit chaque document. */
function routeForDocumentType(type: string): DocRoute {
  switch (type) {
    case "ORDER_FORM":
      // A.V.A. + client — PAS le gérant
      return {
        toCustomer: true,
        toManager: false,
        toAva: true,
        gmailLabel: "Bon de commande",
      };
    case "PREP_SLIP":
      // A.V.A. + gérant — JAMAIS le client
      return {
        toCustomer: false,
        toManager: true,
        toAva: true,
        gmailLabel: "Bon de préparation",
      };
    case "INVOICE":
      // A.V.A. + gérant + client
      return {
        toCustomer: true,
        toManager: true,
        toAva: true,
        gmailLabel: "Factures",
      };
    default:
      return {
        toCustomer: false,
        toManager: true,
        toAva: true,
        gmailLabel: "Documents",
      };
  }
}

/**
 * Envoie un document selon les règles métier :
 * - Bon de commande → A.V.A. (gmail + label) + client — pas le gérant
 * - Bon de préparation → A.V.A. (gmail + label) + gérant — pas le client
 * - Facture → A.V.A. + gérant + client
 */
export async function emailOrderDocument(
  documentId: string,
  opts: {
    audience?: "customer" | "internal" | "both" | "manager" | "circuit";
    gmailLabel?: string;
  } = {}
) {
  const doc = await prisma.orderDocument.findUnique({
    where: { id: documentId },
    include: { order: true },
  });
  if (!doc) throw new Error("NOT_FOUND");

  const route = routeForDocumentType(doc.type);
  const gmailLabel = opts.gmailLabel || route.gmailLabel;

  if (!route.toCustomer && (opts.audience === "customer" || opts.audience === "both")) {
    throw new Error("PREP_SLIP_NEVER_TO_CUSTOMER");
  }

  const cfg = getEmailConfig();
  const { bytes, fileName } = await readOrderDocumentBytes(documentId);
  const title = docTitle(doc.type, doc.invoiceNumber);
  const attachment = {
    filename: fileName,
    content: bytes,
    contentType: "application/pdf",
  };

  const manager = cfg.adminNotificationEmail?.trim().toLowerCase() || null;
  const ava = getAvaArchiveEmail();
  const customer = doc.order.customerEmail.trim().toLowerCase();

  // Destinataires uniques (adresse → rôles)
  const byAddress = new Map<string, DocAudience[]>();
  const add = (email: string | null | undefined, role: DocAudience) => {
    if (!email) return;
    const e = email.trim().toLowerCase();
    const roles = byAddress.get(e) || [];
    if (!roles.includes(role)) roles.push(role);
    byAddress.set(e, roles);
  };

  if (route.toCustomer) add(customer, "customer");
  if (route.toManager) {
    if (!manager) throw new Error("ADMIN_NOTIFICATION_EMAIL manquant pour envoi gérant");
    add(manager, "manager");
  }
  if (route.toAva) {
    if (!ava) throw new Error("Boîte A.V.A. (MAIL_FROM / AVA_ARCHIVE_EMAIL) manquante");
    add(ava, "ava");
  }

  // Stratégie : TO = premier destinataire « principal », BCC = les autres
  // Principal : client si présent, sinon gérant, sinon A.V.A.
  const addresses = [...byAddress.keys()];
  if (addresses.length === 0) {
    throw new Error("Aucun destinataire pour ce document");
  }

  const primary =
    (route.toCustomer && customer) ||
    (route.toManager && manager) ||
    (route.toAva && ava) ||
    addresses[0];
  const bcc = addresses.filter((a) => a !== primary);

  const result = await sendEmail({
    to: primary!,
    bcc: bcc.length ? bcc : undefined,
    subject: `${title} — All Vap's n°${shortRef(doc.orderId)}`,
    html: `<p>Veuillez trouver ci-joint : <strong>${title}</strong>.</p><p>Commande ${shortRef(doc.orderId)}</p>${
      doc.type === "PREP_SLIP"
        ? "<p><em>Document interne boutique — ne pas transmettre au client.</em></p>"
        : ""
    }`,
    text: `${title} — commande ${shortRef(doc.orderId)}`,
    type: "generic",
    relatedOrderId: doc.orderId,
    relatedCustomerId: doc.order.userId || undefined,
    idempotencyKey: `doc:${doc.type}:${doc.orderId}:route-v2`,
    attachments: [attachment],
    isAudit: doc.order.isAudit,
    auditCampaignId: doc.order.auditCampaignId,
  });

  // Classement Gmail côté boîte A.V.A. (si API configurée)
  let gmailMessageId: string | null = null;
  if (result.transport !== "console" && result.transport !== "disabled") {
    const labelResult = await applyGmailLabelIfConfigured({
      labelName: gmailLabel,
      messageId: result.messageId,
    });
    if (labelResult.messageId || labelResult.applied) {
      gmailMessageId = labelResult.messageId || result.messageId || null;
    }
  }

  const rolesHit = new Set<DocAudience>();
  for (const roles of byAddress.values()) {
    for (const r of roles) rolesHit.add(r);
  }

  await prisma.orderDocument.update({
    where: { id: doc.id },
    data: {
      emailedToCustomer: rolesHit.has("customer"),
      emailedInternal: rolesHit.has("manager"),
      emailedToAva: rolesHit.has("ava"),
      gmailLabel,
      gmailMessageId,
    },
  });

  for (const [email, roles] of byAddress) {
    for (const role of roles) {
      await archiveMemoryArtifact({
        userId: doc.order.userId,
        orderId: doc.orderId,
        kind: "email_sent",
        idempotencyKey: `mem:email:doc:${doc.type}:${doc.orderId}:${role}:v2`,
        title: `E-mail ${title} → ${role}`,
        documentId: doc.id,
        metaJson: {
          audience: role,
          toMasked: `${email[0]}***@${email.split("@")[1] || ""}`,
          transport: result.transport,
          messageId: result.messageId || null,
          gmailLabel,
          primary: email === primary,
        },
      });
    }
  }

  return doc;
}

/**
 * Circuit post-paiement (règles Yoann) :
 * - Bon de commande → A.V.A. + client (pas gérant)
 * - Bon de préparation → A.V.A. + gérant (pas client)
 * - Facture → A.V.A. + gérant + client
 */
export async function generatePaidOrderDocuments(orderId: string) {
  const orderForm = await generateAndStoreOrderDocument(orderId, "ORDER_FORM");
  await emailOrderDocument(orderForm.id);

  const invoice = await generateAndStoreOrderDocument(orderId, "INVOICE");
  await emailOrderDocument(invoice.id);

  const prep = await generateAndStoreOrderDocument(orderId, "PREP_SLIP");
  await emailOrderDocument(prep.id);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true },
  });
  if (order?.userId) {
    await refreshClientMemoryFromOrders(order.userId).catch(() => null);
  }

  return { orderForm, invoice, prep };
}
