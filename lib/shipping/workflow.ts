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
import { getEmailConfig } from "@/lib/email/config";
import { archiveMemoryArtifact, refreshClientMemoryFromOrders } from "@/lib/ava-memory/service";
import { readOrderDocumentBytes } from "@/lib/documents/service";

const LABEL_ROOT = path.join(process.cwd(), "storage", "shipments");

export function isLaPosteExcluded(method: string | null | undefined): boolean {
  return method === "COLISSIMO";
}

export function supportedAutoCarriers(): CarrierId[] {
  return ["mondial-relay", "relais-colis"];
}

function shipmentIdempotency(orderId: string, carrier: string) {
  return `shipment:${orderId}:${carrier}`;
}

export async function startCarrierShipmentForOrder(orderId: string): Promise<{
  skipped: boolean;
  reason?: string;
  shipment?: Awaited<ReturnType<typeof prisma.carrierShipment.findUnique>>;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true, variant: true } } },
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
  const existing = await prisma.carrierShipment.findUnique({
    where: { idempotencyKey: key },
  });
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
      nicotine: i.variant?.nicotineLabel || i.variant?.nicotineMg,
      sku: i.product.sku,
    })),
    weightGramsEstimate: Math.max(200, order.items.reduce((s, i) => s + i.quantity * 40, 0)),
    preparedAt: new Date().toISOString(),
  };

  const apiResult = await createCarrierShipment(carrier, {
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
    mode = isCarrierConfigured(carrier) ? "assisted_api_pending" : "assisted";
    lastError = apiResult.message;
  }

  const shipment = await prisma.carrierShipment.create({
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
    idempotencyKey: `mem:shipment:${shipment.id}`,
    title: `Expédition ${carrier} — ${status}`,
    shipmentId: shipment.id,
    metaJson: {
      mode,
      trackingNumber,
      configured: apiResult.configured,
      message: apiResult.message,
    },
  });

  await emailManagerShipmentPack({ orderId, shipmentId: shipment.id });

  if (order.userId) {
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
  let shipment = await prisma.carrierShipment.findUnique({ where: { idempotencyKey: key } });

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

  shipment = await prisma.carrierShipment.upsert({
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
    idempotencyKey: `mem:label:${shipment.id}:${tracking}`,
    title: `Étiquette ${carrier} — ${tracking}`,
    shipmentId: shipment.id,
    metaJson: { trackingNumber: tracking, fileName },
  });

  await emailManagerShipmentPack({
    orderId: input.orderId,
    shipmentId: shipment.id,
    forceLabelAttach: true,
  });

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
  const cfg = getEmailConfig();
  const manager = cfg.adminNotificationEmail;
  if (!manager) return;

  const shipment = await prisma.carrierShipment.findUnique({
    where: { id: opts.shipmentId },
  });
  if (!shipment) return;

  const idempotencyKey = `shipment-manager:${opts.shipmentId}:${shipment.status}:${shipment.trackingNumber || "none"}`;
  const existing = await prisma.emailLog.findFirst({
    where: { idempotencyKey, status: "SENT" },
  });
  if (existing && !opts.forceLabelAttach) return;
  if (shipment.emailedToManager && shipment.status === "pending_label" && !opts.forceLabelAttach) {
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
  if (shipment.labelStoragePath && (shipment.status === "label_ready" || opts.forceLabelAttach)) {
    try {
      const { readFile } = await import("fs/promises");
      const bytes = await readFile(path.join(process.cwd(), shipment.labelStoragePath));
      attachments.push({
        filename: shipment.labelFileName || "etiquette.pdf",
        content: bytes,
        contentType: shipment.labelMimeType || "application/pdf",
      });
    } catch {
      /* ignore */
    }
  }

  const subject =
    shipment.status === "label_ready"
      ? `Étiquette + préparation — ${shipment.carrier} n°${shipment.trackingNumber}`
      : `Préparation expédition ${shipment.carrier} — étiquette à importer`;

  await sendEmail({
    to: manager,
    subject: `${subject} — All Vap's`,
    html: `<p>Dossier expédition <strong>${shipment.carrier}</strong>.</p>
      <ul>
        <li>Commande : ${opts.orderId.slice(-8).toUpperCase()}</li>
        <li>Statut : ${shipment.status}</li>
        <li>Mode : ${shipment.mode}</li>
        <li>Suivi : ${shipment.trackingNumber || "en attente (mode assisté)"}</li>
        <li>Point relais : ${shipment.relayLabel || "voir adresse commande"}</li>
        <li>QR officiel : ${shipment.qrAvailable ? "disponible" : "non fourni (non inventé)"}</li>
      </ul>
      <p>${shipment.lastError ? `Note technique : ${shipment.lastError}` : ""}</p>`,
    text: `Expédition ${shipment.carrier} — ${shipment.status} — suivi ${shipment.trackingNumber || "n/a"}`,
    type: "admin_notification",
    relatedOrderId: opts.orderId,
    idempotencyKey,
    attachments,
  });

  await prisma.carrierShipment.update({
    where: { id: shipment.id },
    data: { emailedToManager: true },
  });
}
