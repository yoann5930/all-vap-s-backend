/**
 * Expéditions Mondial Relay / Relais Colis.
 * La Poste / Colissimo : exclus (aucun développement).
 * Mode API si clés + endpoint branchés ; sinon mode assisté (données + import étiquette).
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import {
  createCarrierShipment,
  deliveryMethodToCarrier,
  isCarrierConfigured,
  type CarrierId,
} from "@/lib/shipping/carriers";
import { sendEmail } from "@/lib/email/service";
import { archiveMemoryArtifact, refreshClientMemoryFromOrders } from "@/lib/ava-memory/service";
import { readOrderDocumentBytes } from "@/lib/documents/service";
import { PREPARER_NOTIFICATION_EMAIL } from "@/lib/ava-order/constants";
import { assertNoPaidShipping } from "@/lib/shipping/real-shipping-guard";

function carrierShipmentDb() {
  return (
    prisma as unknown as {
      carrierShipment?: {
        findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
        create: (args: unknown) => Promise<Record<string, unknown>>;
        upsert: (args: unknown) => Promise<Record<string, unknown>>;
        update: (args: unknown) => Promise<Record<string, unknown>>;
      };
    }
  ).carrierShipment;
}

const LABEL_ROOT = path.join(process.cwd(), "storage", "shipments");

export function isLaPosteExcluded(method: string | null | undefined): boolean {
  return method === "COLISSIMO";
}

export function supportedAutoCarriers(): CarrierId[] {
  return ["mondial-relay", "relais-colis", "chronopost"];
}

function shipmentIdempotency(orderId: string, carrier: string) {
  return `shipment:${orderId}:${carrier}`;
}

export async function startCarrierShipmentForOrder(orderId: string): Promise<{
  skipped: boolean;
  reason?: string;
  shipment?: Record<string, unknown> | null;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) throw new Error("NOT_FOUND");

  if (order.deliveryMethod === "STORE_PICKUP") {
    return { skipped: true, reason: "STORE_PICKUP" };
  }
  if (isLaPosteExcluded(order.deliveryMethod)) {
    return { skipped: true, reason: "LA_POSTE_EXCLUDED" };
  }

  const carrier = deliveryMethodToCarrier(order.deliveryMethod);
  if (!carrier || !supportedAutoCarriers().includes(carrier)) {
    return { skipped: true, reason: "UNSUPPORTED_CARRIER" };
  }

  const key = shipmentIdempotency(orderId, carrier);
  const db = carrierShipmentDb();
  if (!db) {
    return {
      skipped: true,
      reason: "NOT_CONFIGURED",
    };
  }
  let existing: Record<string, unknown> | null = null;
  try {
    existing = await db.findUnique({
      where: { idempotencyKey: key },
    });
  } catch {
    return { skipped: true, reason: "NOT_CONFIGURED" };
  }
  if (existing) {
    return { skipped: false, shipment: existing, reason: "IDEMPOTENT_REUSE" };
  }

  const packData = {
    orderId: order.id,
    orderRef: order.id.slice(-8).toUpperCase(),
    customerName: order.customerName,
    customerEmailMasked: order.customerEmail.replace(/(^.).*(@.*$)/, "$1***$2"),
    shippingAddress: order.shippingAddress,
    deliveryMethod: order.deliveryMethod,
    items: order.items.map((i) => ({
      name: i.product.name,
      qty: i.quantity,
      nicotine: null,
      sku: i.product.sku,
    })),
    weightGramsEstimate: Math.max(200, order.items.reduce((s, i) => s + i.quantity * 40, 0)),
    preparedAt: new Date().toISOString(),
  };

  const apiResult = order.isAudit || !assertNoPaidShipping("createCarrierShipment").allowed
    ? {
        ok: false as const,
        carrier,
        configured: false,
        message: order.isAudit
          ? "AUDIT_ONLY — aucun appel transporteur réel."
          : "ALLOW_REAL_SHIPPING/DEMO_MODE — aucune étiquette payante.",
      }
    : await createCarrierShipment(carrier, {
        orderId: order.id,
        recipientName: order.customerName || order.customerEmail,
        recipientEmail: order.customerEmail,
        addressLine: order.shippingAddress || "",
        postalCode: "",
        city: "",
      });

  let status = "assisted";
  let mode = "assisted";
  let trackingNumber: string | null = null;
  let externalShipmentId: string | null = null;
  let labelStoragePath: string | null = null;
  let labelFileName: string | null = null;
  let lastError: string | null = null;

  if (apiResult.ok && apiResult.trackingNumber) {
    status = "label_ready";
    mode = "api";
    trackingNumber = apiResult.trackingNumber;
    externalShipmentId = apiResult.externalShipmentId || null;
    if (apiResult.labelPdfBase64) {
      const dir = path.join(LABEL_ROOT, orderId);
      await mkdir(dir, { recursive: true });
      labelFileName = `${carrier}-label.pdf`;
      labelStoragePath = path.join("storage", "shipments", orderId, labelFileName);
      await writeFile(
        path.join(process.cwd(), labelStoragePath),
        Buffer.from(apiResult.labelPdfBase64, "base64")
      );
    }
  } else {
    status = "pending_label";
    mode = order.isAudit
      ? "assisted_audit"
      : isCarrierConfigured(carrier)
        ? "assisted_api_pending"
        : "assisted";
    lastError = apiResult.message;
  }

  let shipment: Record<string, unknown>;
  try {
    shipment = await db.create({
      data: {
        orderId,
        carrier,
        status,
        mode,
        idempotencyKey: key,
        trackingNumber,
        externalShipmentId,
        relayLabel: order.shippingAddress,
        labelStoragePath,
        labelFileName,
        qrAvailable: false,
        packDataJson: packData,
        lastError,
      },
    });
  } catch (err) {
    console.warn("[shipping] CarrierShipment persist unavailable", err);
    return { skipped: true, reason: "NOT_CONFIGURED" };
  }

  if (trackingNumber) {
    await prisma.order.update({
      where: { id: orderId },
      data: { trackingNumber },
    });
  }

  await archiveMemoryArtifact({
    userId: order.userId,
    orderId,
    kind: "tracking",
    idempotencyKey: `mem:shipment:${String(shipment.id)}`,
    title: `Expédition ${carrier} — ${status}`,
    shipmentId: String(shipment.id),
    metaJson: {
      mode,
      trackingNumber,
      configured: apiResult.configured,
      message: apiResult.message,
    },
  });

  if (!order.isAudit && shipment.id) {
    await emailManagerShipmentPack({ orderId, shipmentId: String(shipment.id) });
  }

  if (order.userId && !order.isAudit) {
    await refreshClientMemoryFromOrders(order.userId).catch(() => null);
  }

  return { skipped: false, shipment };
}

/**
 * Mode assisté : importer une étiquette PDF officielle (fournie hors site).
 * N'invente jamais de suivi / QR.
 */
export async function importAssistedCarrierLabel(input: {
  orderId: string;
  trackingNumber: string;
  labelPdf: Buffer;
  fileName?: string;
  relayPointId?: string;
  actorUserId?: string;
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new Error("NOT_FOUND");
  if (isLaPosteExcluded(order.deliveryMethod)) {
    throw new Error("LA_POSTE_EXCLUDED");
  }
  const carrier = deliveryMethodToCarrier(order.deliveryMethod);
  if (!carrier || !supportedAutoCarriers().includes(carrier)) {
    throw new Error("UNSUPPORTED_CARRIER");
  }

  const tracking = input.trackingNumber.trim();
  if (!tracking || tracking.length < 5) throw new Error("TRACKING_REQUIRED");

  const key = shipmentIdempotency(input.orderId, carrier);
  const db = carrierShipmentDb();
  if (!db) throw new Error("NOT_CONFIGURED");
  let shipment = await db.findUnique({ where: { idempotencyKey: key } });

  const dir = path.join(LABEL_ROOT, input.orderId);
  await mkdir(dir, { recursive: true });
  const fileName = input.fileName || `${carrier}-label-officiel.pdf`;
  const storagePath = path.join("storage", "shipments", input.orderId, fileName);
  await writeFile(path.join(process.cwd(), storagePath), input.labelPdf);

  if (shipment?.labelStoragePath && shipment.status === "label_ready") {
    // Idempotent : ne pas écraser une étiquette déjà finalisée avec le même suivi
    if (shipment.trackingNumber === tracking) {
      return { shipment, reused: true };
    }
  }

  shipment = await db.upsert({
    where: { idempotencyKey: key },
    create: {
      orderId: input.orderId,
      carrier,
      status: "label_ready",
      mode: "assisted",
      idempotencyKey: key,
      trackingNumber: tracking,
      relayPointId: input.relayPointId || null,
      relayLabel: order.shippingAddress,
      labelStoragePath: storagePath,
      labelFileName: fileName,
      qrAvailable: false,
      packDataJson: { importedBy: input.actorUserId || null, at: new Date().toISOString() },
    },
    update: {
      status: "label_ready",
      mode: "assisted",
      trackingNumber: tracking,
      relayPointId: input.relayPointId || null,
      labelStoragePath: storagePath,
      labelFileName: fileName,
      lastError: null,
    },
  });

  await prisma.order.update({
    where: { id: input.orderId },
    data: { trackingNumber: tracking },
  });

  await archiveMemoryArtifact({
    userId: order.userId,
    orderId: input.orderId,
    kind: "carrier_label",
    idempotencyKey: `mem:label:${String(shipment?.id)}:${tracking}`,
    title: `Étiquette ${carrier} — ${tracking}`,
    shipmentId: String(shipment?.id || ""),
    metaJson: { trackingNumber: tracking, fileName },
  });

  if (shipment?.id) {
    await emailManagerShipmentPack({
      orderId: input.orderId,
      shipmentId: String(shipment.id),
      forceLabelAttach: true,
    });
  }

  if (order.userId) {
    await refreshClientMemoryFromOrders(order.userId).catch(() => null);
  }

  return { shipment, reused: false };
}

async function emailManagerShipmentPack(opts: {
  orderId: string;
  shipmentId: string;
  forceLabelAttach?: boolean;
}) {
  const manager = PREPARER_NOTIFICATION_EMAIL;
  const db = carrierShipmentDb();
  if (!db) return;
  const shipment = await db.findUnique({
    where: { id: opts.shipmentId },
  });
  if (!shipment) return;

  const status = String(shipment.status || "");
  const tracking = (shipment.trackingNumber as string | null) || null;
  const carrier = String(shipment.carrier || "");
  const idempotencyKey = `shipment-manager:${opts.shipmentId}:${status}:${tracking || "none"}`;
  const existing = await prisma.emailLog.findFirst({
    where: { idempotencyKey, status: "SENT" },
  });
  if (existing && !opts.forceLabelAttach) return;
  if (shipment.emailedToManager && status === "pending_label" && !opts.forceLabelAttach) {
    return;
  }

  const prep = await prisma.orderDocument.findFirst({
    where: { orderId: opts.orderId, type: "PREP_SLIP" },
  });

  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  if (prep) {
    try {
      const { bytes, fileName } = await readOrderDocumentBytes(prep.id);
      attachments.push({ filename: fileName, content: bytes, contentType: "application/pdf" });
    } catch {
      /* ignore */
    }
  }
  const labelPath = shipment.labelStoragePath ? String(shipment.labelStoragePath) : "";
  if (labelPath && (status === "label_ready" || opts.forceLabelAttach)) {
    try {
      const { readFile } = await import("fs/promises");
      const bytes = await readFile(path.join(process.cwd(), labelPath));
      attachments.push({
        filename: String(shipment.labelFileName || "etiquette.pdf"),
        content: bytes,
        contentType: String(shipment.labelMimeType || "application/pdf"),
      });
    } catch {
      /* ignore */
    }
  }

  const ref = opts.orderId.slice(-8).toUpperCase();
  const subject =
    status === "label_ready"
      ? `All Vap's — Expédition prête — Commande #${ref}`
      : `All Vap's — Expédition à finaliser — Commande #${ref}`;

  await sendEmail({
    to: manager,
    subject,
    html: `<p>Dossier expédition <strong>${carrier}</strong>.</p>
      <ul>
        <li>Commande : ${ref}</li>
        <li>Statut : ${status}</li>
        <li>Mode : ${String(shipment.mode || "")}</li>
        <li>Suivi : ${tracking || "en attente (mode assisté) — aucun numéro inventé"}</li>
        <li>Point relais : ${String(shipment.relayLabel || "voir adresse commande")}</li>
        <li>QR officiel : ${shipment.qrAvailable ? "disponible" : "non fourni (non inventé)"}</li>
      </ul>
      <p>${shipment.lastError ? `Note technique : ${String(shipment.lastError)}` : ""}</p>`,
    text: `Expédition ${carrier} — ${status} — suivi ${tracking || "n/a"}`,
    type: "admin_notification",
    relatedOrderId: opts.orderId,
    idempotencyKey,
    attachments,
  });

  try {
    await db.update({
      where: { id: shipment.id },
      data: { emailedToManager: true },
    });
  } catch {
    /* ignore */
  }
}
